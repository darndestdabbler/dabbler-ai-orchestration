# STATUS — sessions 113–158 CLOSED, all VERIFIED: the deployables block, the Java/Maven walk and its nine defects, the suite off the operator's machine, the principle of who owns a command, the policy a module session runs under, the basics the operator saw go wrong, the focused-or-global session the plan decides with one click to start it, the UAT walk that found ten product defects in the UI path, sessions 131–133 answering all ten of them, session 134 fixing what the verifier is told and widening what it can see, session 135 letting the direct-API verifier ask for a file and giving .NET a root, session 136 measuring what the run of record does to the operator's machine and cutting the load, session 137 shipping the release and paying for four defects on the way, session 138 repairing all four, session 139 preparing 2.0.19 and putting its publication to the operator, who held it, and session 140 making the two surfaces that say where a session is agree with each other and with the record, and shipping it, session 141 taking the answer to "which branch is the trunk" from the repository rather than the host and refusing a checkout that carries no record, session 142 turning that refusal into a choice the operator is offered and a verb that carries it out, session 143 holding the Dabbler Terminal to one rule -- every phase in one tone, one gate row for both screens, and marks painted in a job's bytes -- and session 144 answering whether the model asked for is the model that answered, where three verification rounds found three real things and two of them were defects that would have shipped, session 145 giving the operator one place to see and set what a session is run with -- which uncovered that the model list was still the direct-API registry on a Copilot seat -- session 146 making the code agree with what a model list actually costs to obtain, which is nothing on all three surfaces: the seat states its own models over its protocol, a free record refreshes itself at session start, a model that stopped being served is marked rather than dropped, every cost names its billing platform, and the pane offers a seat's own catalog on a seat, and session 147 making a stop something a developer can act on: what refused in the words of the thing that refused, who acts, what each way on costs and the command for it; **2.1.3 IS PUBLISHED to the Marketplace, carrying 148 and 149. 2.1.0 and 2.1.2 never shipped** — 2.1.0 refused over a walk-jobs timeout on the runner and 2.1.2 died on a Marketplace request timeout, so both tags stand on origin unpublished and 2.1.3 supersedes them; session 152 naming the two reviewing roles by voice and giving each its own vehicle, and session 153 taking the run of record off the host scheduler into a Podman container — 324 s to 26.4 s — with the one file that cannot follow it declared and the reason it cannot owed forward, and a guard that will not read a cancelled test as a pass, and session 154 closing the dark gate behind the extension suite's second door — CI had been red for eleven consecutive runs while three sessions closed VERIFIED through the other one — by arming the seam once where both doors read it, making the refusal cover mocha as well as node:test, and holding every gate to the suite it stands for with a divergence that is declared rather than forbidden, session 155 organising the Configuration section by the thing being configured rather than by the mechanism that configures it — two participants, five leaves, the Auxiliary Reviewer given the surface it has never had, and a projection re-derived whenever it is read, because nothing in a workspace can watch a user-level catalog — and session 156 walking the whole model-catalog block on both transports and both engines BEFORE publishing it, which is the entire argument for the order: twenty-one numbered readings, eleven defects fixed and four raised, five of them stopping an operator and every one of those five sitting in the block that was about to ship, **and 2.2.0 IS PUBLISHED**, and session 157 giving a configured choice one place to live -- four layers deciding a vehicle and no fifth, `DABBLER_TRANSPORT` read by nothing that decides, the `configuration` block out of the projection and three vestigial fields out of the catalog, one reviewing vehicle for both reviewers, and `dabbler configuration options`/`explain` beside a `--authoring-model` that has never existed while the pane offered to set one -- through four rounds of blocking findings and one dispute the reviewer upheld, and session 158 making the model an operator picks the model that runs -- `--model` reaching both CLIs from the launch a person presses for the first time, an engine's refusal read as a refusal where its exit code says the run went fine, the authoring list read for the ENGINE rather than the machine, and the Configuration section DRIVEN in a running editor before it shipped, which found five defects in code that had already closed VERIFIED -- **and 2.3.0 IS PUBLISHED**, and session 159 giving an operator a way to change which API key a session runs on without editing their environment -- a credential store on this machine, a NAME in the committed settings and never a value, the environment still first so nobody's CI changes, and a walk that drove it in a real terminal and a running editor and found three defects in code written the same morning -- **and 2.4.0 IS PUBLISHED**, and session 160 shipping the shim -- the `dabbler` command inside every VSIX since 2.3.0 had died on its first require because the extension's build lacked one bundler option the router's build had, so the option is in both places, the build now runs the bundle it just wrote before packaging it, the pre-commit hook blocks a router that ran and crashed instead of letting the commit through with a stack trace, and the walk installed the VSIX into a scratch editor and ran the printed commands through the shim in a real terminal -- **and 2.4.1 IS PUBLISHED; sessions 161 and 162 remain planned**

**Branch: `master`.** Trunk-based; nothing lives anywhere else.

> ## SESSION 160 CLOSED, 2026-09-13 — the shim that ships, and 2.4.1 published
>
> | session | what | state |
> | --- | --- | --- |
> | 160 | one bundler option, a build that runs what it built, a hook that blocks a crashed router, and the installed-VSIX walk | CLOSED VERIFIED at round 1 (no blocking findings), landed `70d9d9d6`, closed `56d019ca`. **RELEASED: `vsix-v2.4.1` is on origin; CI's publish job logged "Published DarndestDabbler.dabbler-ai-orchestration v2.4.1" at 10:27Z**; the gallery still served 2.4.0 at 10:35Z, which its own log calls "might take a few minutes" |
>
> **Sessions 161 and 162 are planned and next.** `nextSession` is 161.
>
> **What was wrong.** Every VSIX since 2.3.0 shipped a `dabbler.cjs` that
> died on every verb with `Cannot find module './impl/format'` — the
> terminal shim, *Start Unattended Session*, and the pane's catalog refresh
> and `auth set` all run that file. `tools/dabbler-ai-orchestration/esbuild.js`
> bundles the CLI from the router's SOURCE with its own options, and those
> lacked the `mainFields: ["module", "main"]` that `packages/router/build.mjs`
> gained in 157; `extension.js` was fine because it bundles the prebuilt
> `dist/index.cjs`. Nothing ran the built bundle: the walks of 158 and 159
> drove the extension from `--extensionDevelopmentPath`, which never loads it.
>
> **What changed.** The option is in both places with the reason beside it;
> the build resolves its entry points against its own directory and, after
> the copy, runs `node dist/dabbler.cjs version` and fails on a non-zero exit
> before `vsce package` sees the file — a build step, not a test, and no
> suite duplicates it. `PRE_COMMIT_HOOK` now lets exit 0 and 127 (not on
> PATH) through, blocks silently on the guard's own verdict (4), and blocks
> every other exit naming `dabbler version` and `git commit --no-verify`;
> one test runs the hook under `sh` with a fake `dabbler` on a two-entry
> PATH. The changelog tells operators to run `dabbler bootstrap` again,
> because bootstrap rewrites a hook carrying `HOOK_MARKER` and nothing else
> does.
>
> **The walk (`docs/uat/uat-shim-walk.md`)** packaged the VSIX, installed it
> with the harness's own Code binary into a scratch extensions directory,
> activated the extension, typed `dabbler version` into a real PowerShell
> terminal (2.4.1, resolved to the extension's launcher), ran bootstrap,
> `session start`, `session next`, the printed `answer_command` verbatim and
> `next` again through the shim, and clicked *Update the Catalog* on the
> Configuration row: its terminal wrote a catalog stamped by router 2.4.1
> and the tree repainted from it. The operator's editor was not touched.
>
> **Found by the walk, NOT fixed, for the next plan:** the pane's authoring
> *Vehicle* row says "none installed" when a null choice is rendered,
> including the case where TWO engine CLIs are on PATH and the router leaves
> the choice to a person — `dabbler configuration options` under the same
> environment listed `claude-code` and `copilot` both installed. One ternary
> in `tools/dabbler-ai-orchestration/src/providers/solutionTreeModel.ts`. Also
> cosmetic: the refresh's terminal tab is labelled "Code", the shell process,
> not the record's title.
>
> **Traps met, all in the walk's harness and none in the product:** a palette
> fill must start with `>`; a modal confirm needs `window.dialogStyle:
> custom` to be clickable; a context-menu entry needs the item element, not
> its label; `next`'s JSON is on stdout alone, the log lines on stderr; and
> `sed -i` under Git Bash ate the backslashes in the document — write with
> the editor.

> ## SESSION 159 CLOSED, 2026-09-12 — the keys an operator can change without editing their environment, and 2.4.0 published
>
> | session | what | state |
> | --- | --- | --- |
> | 159 | a credential store, a reference in the settings, the resolution order, the pane's key rows, and the walk | CLOSED VERIFIED at round 3 (two rounds of blocking findings, all fixed), landed `5baf3ab9`, closed `12f918d9`. **RELEASED: `vsix-v2.4.0` is on origin and packaging reported published** |
>
> **THE PLAN IS EMPTY. `nextSession` is null.** Sessions 157–159 were the
> last three declared, and all three are closed.
>
> **What it does.** `dabbler auth set|list|remove` keeps a provider key in
> this machine's own store; `dabbler configure --credential <provider>=<name>`
> names which one a solution uses, as a NAME in `.vscode/settings.json` that
> is safe to commit. Resolution is the environment, then the checkout's
> reference, then this person's default — the environment first because that
> is how CI injects a key, so **nobody running on variables today is
> affected by any of it**. A reference naming a credential this machine does
> not hold is a stop that names the layer and the command, at `session start`
> and at dispatch, never a fall to the next layer.
>
> **The Windows store is a DPAPI-encrypted file this application owns. It is
> NOT Windows Credential Manager**, the operator approved that on 2026-09-12
> over the alternative (which needs `CredRead` P/Invoked through embedded C#
> on every read), and `docs/design/credential-store.md` carries the scope, the
> measurements and what was traded away. D277 records the choice.
>
> **Two measured constraints on the Windows path**, both binding:
> `powershell.exe` must NOT inherit this machine's `PSModulePath` — with
> PowerShell 7's module directories ahead of 5.1's, Windows PowerShell fails
> to autoload `Microsoft.PowerShell.Security` and `ConvertFrom-SecureString`
> is not a command at all — and the store is decrypted once per PROCESS, not
> once per read, because a spawn is ~300 ms and `providerReachable` runs in
> loops.
>
> **macOS needs `security -i`.** `-w` with no value does NOT read stdin: it
> prompts on the controlling terminal, so piping to it stores nothing. `-i`
> reads its whole command from stdin, password included, and no process on
> the machine lists it. Neither macOS nor Linux was exercised — one machine,
> and it runs Windows — and the release notes say so.
>
> **THE WALK FOUND THREE, ONE IN CODE WRITTEN THAT MORNING.** A credential
> setting was invisible in a checkout git does not know, because the stamp
> resolved the root through `projectRoot` (the git toplevel) rather than the
> checkout it was handed — the 158 shape through a new door. A modal
> confirmation stood in front of a terminal that asks anyway, and the modal
> BLOCKED the window it was drawn over. And a provider whose key does not
> resolve dropped out of the model list in silence.
>
> **Verification was right twice more, and both were my own fixes.** Round 1:
> the macOS write could not supply a secret at all, and a credential name was
> not bound to the provider it was stored for. Round 2, entirely caused by
> round 1's fix: `auth set` would silently overwrite a name another provider
> owned, and a mismatched reference blocked a machine whose environment
> variable was perfectly able to answer. Round 3: VERIFIED.
>
> **OPEN, and it is the operator's: D278.**
> `.dabbler/runs/s60/driver/engine-07.log` (2026-08-31) holds **all three
> provider keys in plaintext**, under a block headed `== keys present` that
> printed each variable's VALUE. Bounded and measured: one file, nothing else
> under `.dabbler/` holds a key, `.dabbler/` is gitignored whole and no commit
> in the entire history contains any of the three literals, and the code that
> wrote it is gone. It is still a plaintext credential in a tree AI engines
> read, and it was read during the walk. **Rotate the three keys**, and
> remove or redact that file. Session 159 did not delete it: the machine owns
> that record.
>
> **A trap that cost this session two minutes and would cost the next one
> more.** A tree fires a row's command on a CHANGE of selection, so a
> Playwright reading that right-clicks a row before left-clicking it will
> find the left click does nothing — which looks exactly like a broken
> control. Click order is part of the reading.

> ## SESSION 158 CLOSED, 2026-09-12 — the model an operator picks is the model that runs, and 2.3.0 published
>
> | session | what | state |
> | --- | --- | --- |
> | 158 | `--model` into both launches, an engine's refusal read as one, the authoring list read for the engine, the pane walked in a running editor | CLOSED VERIFIED at round 3 (two rounds of blocking findings, all fixed), landed `b5bcf9c6`, closed `88df39fb`. **RELEASED: `vsix-v2.3.0` is on origin and packaging reported published** |
>
> **THE PLAN IS EMPTY AGAIN AFTER 159.** Session 159 is the last one declared.
>
> **The model now reaches the engine.** `engineTerminalFor` built `args:
> cli.carriesPrompt ? [sentence] : []` and never passed `--model`, so a seat
> was RECORDED on one model while `copilot` ran on `auto` and Claude Code was
> never asked for one at all. Both launches carry it now, unnormalised --
> `normalizeModelToken` drops the date suffix that makes a pin a pin.
>
> **An engine's refusal is the framework's refusal, and the exit code is not
> the signal.** Measured on Claude Code 2.1.269, 2026-09-12: a rejected
> `--model` prints its marker on **stderr**, answers with an ordinary message,
> and **exits 0** — its own `result` event carries `subtype: "success"` beside
> `is_error: true`. The driver stops on the marker. The INTERACTIVE launch
> cannot read it at all (the terminal is the person's), so it asks the CLI
> first: **`claude -p --model <id>` with no prompt validates against the CLI's
> own bundled catalog, complains on stderr, and stops** — free either way,
> because nothing is sent. A CLI that says nothing stops nobody.
>
> **The authoring list is the ENGINE's, not the machine's.** Of the eight
> Anthropic ids a seat lists, `claude` refuses five. Under `claude-code` the
> list is the catalog's Anthropic block; on a seat it is the seat's own; where
> nothing enumerates, `opus`/`sonnet`/`haiku` are a marked FLOOR — and a floor
> never refuses, because it is a reading that says it does not know.
>
> **THE WALK IS WHY THIS SESSION WAS WORTH RUNNING.** The pane was driven in a
> real VS Code (Playwright Electron, `configuration-pane.spec.ts`) and found
> FIVE defects, three of them in code this session had already written and
> tested: the authoring row said *"nothing resolves"* where four models did;
> `orchestratorOf` fell back to the LAST session's orchestrator, so a finished
> session's engine narrowed the list for the next one (the 131/132 shape
> through a new door); `configurationNode` read the vehicle with no root, so
> `configuration explain` named the WRONG REPOSITORY's layer; `explain` said
> "nobody chose one" beside the model just chosen; and a seat session's author
> had no provider, so the cross-provider label rendered nowhere.
>
> **Verification was right three times running.** Round 1: the launch was the
> other door and it was open; a `--model` typed at `session start` was not the
> author the reviewers were measured against. Round 2: a catalog check is not
> the CLI's own refusal, and a control that is written must be proved WIRED.
> Round 3: VERIFIED (`gpt-5.6-terra`/openai).
>
> **Two traps for the next session.** The publish DEADLOCKED once: the owed
> answer says *"the framework acts on it from here; you are not asked to run
> anything"*, and that is false — `dabbler release` must be run a SECOND time
> after the decision, which is what makes the tag. And `session next` after a
> fix re-runs every accepted step's checks (~3.5 min); run it in the
> background or it is cut off mid-sequence and looks like a stall.
>
> **OWED, raised not fixed:** `identity.ts` refuses a seat model with *"does
> not resolve in the model registry ... Re-run start_session with a
> registry-known --model"*. Session 151 DELETED that registry; the resolution
> reads the catalog and only the words are stale, so an operator is sent
> looking for a file that no longer exists. One sentence, outside every step
> session 158 declared. `docs/uat/uat-configuration-pane-walk.md` carries it.

> ## SESSION 157 CLOSED, 2026-09-12 — one place a choice is kept, and four things deleted
>
> | session | what | state |
> | --- | --- | --- |
> | 157 | one resolution order for a vehicle, `DABBLER_TRANSPORT` out of it, four deletions, one reviewing vehicle, and two verbs | CLOSED VERIFIED at round 5 (four rounds of blocking findings, all fixed bar one dispute the reviewer upheld), landed `58738775`, closed `1e96a077`. NOT releasable: 158 is the half an operator can see |
>
> **A vehicle is decided by four layers and no fifth: a `--transport` flag,
> then `<repo>/.vscode/settings.json` under `dabbler.*`, then the user-level
> `preferences.json`, then the configuration the distribution ships.**
> `DABBLER_TRANSPORT` is read by nothing that decides anything — `configure`
> and `bootstrap` report it as obsolete and name the command that replaces it
> — and `local-overrides.yaml`'s `transport.profile` is a STOP naming the key
> and the command, because the replaced verbs wrote exactly that key and it
> now sits below a personal default, where it would have been shadowed
> silently. **This repository's own vehicle moved: `.vscode/settings.json`
> carries `dabbler.transport: api`, committed.**
>
> **Four deletions.** `.dabbler/api-models.lock` (orphaned by 150, referenced
> by nothing that runs). The `configuration` block out of the projection —
> 50,198 of 51,002 bytes against 804 of module graph — with the file renamed
> `.dabbler/solution/solution.json`; the extension joins a FRESH reading on at
> read, so it can never render an older router's bytes (D276 for this half).
> `alias`, `fidelity` and `providerRelation` out of the catalog and projection
> types: `alias === model` for 261 of 261, per-model `fidelity` was
> `not-known` for 259 of 261 and is derived at the round anyway, and the
> cross-provider WORD is now derived at render from the author's provider,
> stated once, against each candidate's own. `price_category` and `cost` stay.
>
> **One reviewing vehicle for both reviewers.** An auxiliary key that agrees
> is ignored; one that differs is a stop naming both keys, because choosing
> between two live values on the operator's behalf is how state stops matching
> the record. A non-reviewing role keeps its own config-tier vehicle.
>
> **Two verbs added and no more.** `dabbler configure --authoring-model`,
> checked against the list the PANE offers (the engine's own, not the
> transport's) so the offer and the acceptance are one list; `dabbler
> configuration options` (every choice with local availability on it) and
> `dabbler configuration explain` (each resolved value with the layer that
> decided it, and the layers it shadows).
>
> **FOUR ROUNDS OF BLOCKING FINDINGS, and the reviewer was right about all
> but one.** Round 1 found that `--authoring-model` wrote a setting no reader
> consumed — a control reporting success and changing nothing, which is the
> exact failure this block exists to delete. Round 2 found that the start
> gate's layer list was missing the two REVIEWING layers, so the rule it
> asserted did not apply to the case it was written for; and that a TTL is not
> a repaint, because VS Code has no reason to ask again. Round 3 found that
> `repoRoot` scoped the settings read but not the config the ladder was built
> from, so a round for repository B could bill A's vehicle. **Session 155's
> claim that nothing in a workspace can watch a user-level file is retired: a
> `RelativePattern` over an absolute base reaches it, and the Solution
> Explorer now watches the catalog and preferences directly.**
>
> **The dispute that was upheld, and why it was worth filing anyway.** I
> argued `local-overrides.yaml` was a config SOURCE in the bottom tier rather
> than a fifth input. Round 2 answered the argument I had not made: every
> checkout created before this session carries that key because the replaced
> verbs wrote it, so it is an upgrade population and not a hypothetical. The
> refusal is the fix, and it is the same shape as the auxiliary-key stop.
>
> **The close needed `verify reopen --rounds 1`.** Round 4 VERIFIED the tree;
> the run of record then failed (the overlay reading spawned git for a
> checkout the caller had already named, which the container's no-git preload
> refuses) and the framework asked for the fix — which moved the verified
> tree. Putting it back was not an answer, so the round was bought and
> recorded. Round 5: VERIFIED.

> ## SESSION 156 CLOSED, 2026-09-11 — the block walked on both transports, and 2.2.0 published
>
> | session | what | state |
> | --- | --- | --- |
> | 156 | the model-catalog block walked on both transports and both engines, eleven defects fixed and four raised, and the block shipped | CLOSED VERIFIED at round 1 (Minor-only), landed `d9759b28`, closed `a4bbc8ef`. **RELEASED: `vsix-v2.2.0` is on origin and packaging reported published** |
>
> **THE PLAN IS EMPTY: `close` reports "no session is left to run; the plan
> declares no more."** Session 156 was the last one declared. The next
> session has to be planned before it can be started.
>
> **THE WALK FOUND FIVE DEFECTS THAT STOP AN OPERATOR, AND ALL FIVE WERE IN
> THE BLOCK ABOUT TO BE PUBLISHED.** That is the whole case for walking before
> releasing rather than after. `docs/uat/uat-model-catalog-walk.md` is the
> record: twenty-one numbered entries — eleven product defects, two readings,
> one document error and seven confirmations — each with its disposition, and
> the counts add up. The five:
>
> 1. **A model selection was a one-way door.** After one `configure
>    --reviewer-model`, every later selection was refused — including models
>    the transport plainly lists, and including an empty value — with `It
>    lists: <the model you already chose>`. One argument: `offered()` took
>    `applySelection`'s default, so it checked each new name against a list
>    the stored pin had already collapsed to one. `roleNode` passes
>    `applySelection: false` for exactly this reason and says so; the pane's
>    pick list is built from that reading and documented as "a place to CHANGE
>    a choice". The pane offered the change and the router refused it.
>    Reproduced identically on both transports.
> 2. **Five of the seat's twenty-six models were unreachable**, and the
>    refusal said the transport does not list a model the transport lists.
>    SPLIT: the false sentence is fixed (three cases now, and the middle one
>    says the limit is the framework's, not your seat's); *offering* them is
>    owed, because every round records `reviewer_provider` and an adjudication
>    excludes by provider — a model whose vendor cannot be named cannot be
>    excluded, so it is a decision about what a reviewer may be.
> 3. **Under Claude Code no authoring MODEL is declared** — `session start`
>    takes none, so the orchestrator row is `{engine, provider}` — and
>    `providerRelation` was computed from the author's model alone. The label
>    that replaced three deleted rules appeared on **no row at all, on either
>    transport, on the engine this repository runs on**. Fixed by labelling
>    from the author's PROVIDER, which the ledger has. The same-model refusal
>    still needs a model identifier and stays asserted at the wire.
> 4. **The pane downgrades a projection a newer router wrote** (D276, owed).
>    Session 155 made `SolutionTreeProvider` derive at activation whatever is
>    on disk — right when the extension is newer, and backwards when it is
>    not. The deriver is the extension's OWN bundled router: this repository's
>    projection lacked `auxiliaryReviewer` at session start while the tree's
>    source emits it, and neither the bundled dist nor installed 2.1.3 knows
>    the node. Raised rather than patched: a projection carries no version, so
>    a reader cannot tell an older writer's output from a newer one's.
> 5. **One rule, two verbs, one guard.** `dabbler discovery refresh` refused
>    mid-session and `dabbler copilot refresh` did not, while both write the
>    seat block of the same catalog — measured side by side in one session.
>    Session 154's shape one layer over. The refusal now has one home,
>    `refreshRefusal`, and both doors read it.
>
> **ALSO FIXED:** a wrong-scope catalog reported **fresh** — `checkFreshness`
> was the last unscoped reader, the one `catalog.ts` names by name, and a
> machine whose whole record belongs to somebody else was told it needed
> nothing (its dead twin `lastRefreshedAt` went too); the authoring list was
> unfiltered until the ledger named an engine, so a repository on its first
> day offered Gemini as a model Claude Code could author with; the auxiliary
> accepted the primary's own model, a pairing guaranteed to stop every
> adjudication; the api path's "not read yet" message offered `dabbler copilot
> refresh`, which reads the seat and no provider endpoint; `discovery drift`
> listed 202 ids as qualifying, embeddings and whisper among them (131 now);
> and the refresh summary claimed every transport when one had failed.
>
> **WHAT THE WALK PROVED, not just what it found.** A refresh costs nothing on
> both transports and says so (5.9 s, 26 + 196 models, no prompt sent). The
> engine really does narrow authoring — 11 Anthropic models against the
> reviewer's 125. The pin holds at the wire: two real seat turns, pinned to
> two different models, both opened on the model asked for. And **67 of 67**
> api rounds since session 120 served the model they requested.
>
> **OWED, and each is a decision on the log.**
> - **D274 — there is no seat evidence under this block.** The 57 clean seat
>   rounds in the record are all from sessions 93–99, before the catalog
>   existed; 100–155 all ran on `api` because `DABBLER_TRANSPORT=api` is set
>   in this machine's environment and outranks every config layer. One real
>   session with it cleared and the vehicle set to the seat is what settles
>   it, and that spends AI credits, so it is the operator's call. The reviewer
>   raised the same gap independently and called it a material limitation on
>   the release evidence.
> - **D275 — a seat's `config_option_update` is NOT served-model evidence.**
>   Measured twice: `model.currentValue` came back `gpt-5.6-sol` whatever was
>   pinned, so it is the seat's own default being re-broadcast. One turn would
>   have read as a silent mid-turn model switch. Nothing reads the field
>   today; it is written down because it is the first thing a session looking
>   for served-model evidence over ACP will find.
> - **D276 — the projection downgrade above.**
> - **Half of finding 7** — whether a provider-unknown model may hold a
>   reviewing role at all.
>
> **THREE MINOR FINDINGS FROM THE ROUND ITSELF, none blocking, all real** —
> the tree may not move after a verdict, so they are owed rather than fixed:
> 1. `RoleReading.listed` does not meet its own documented contract on the API
>    transport. It is built from `models`, which on api is already
>    `apiSelectableModels(...)`, so a listed-but-unselectable api id still
>    falls to the "not listed" branch. One line: build it from `block.models`.
> 2. The refresh-guard test proves `refreshRefusal` and not that
>    `copilotVerb(["refresh"])` calls it — session 154's own lesson, check a
>    control is WIRED and not just written. The reviewer supplied the test.
> 3. The walk record names the router it walked with as 2.1.3, which is true
>    and is one version behind what shipped.
>
> ## SESSION 155 CLOSED, 2026-09-11 — the Configuration section a person reads, and a projection that is never stale
>
> | session | what | state |
> | --- | --- | --- |
> | 155 | two participants and five leaves in place of five rows named after implementation, the Auxiliary Reviewer given a surface, and the projection re-derived whenever it is read | CLOSED VERIFIED at round 2 (round 1 clean, Minor-only), landed `3a090381`, closed `5315505e`. **Not releasable** — the block ships from 156 |
>
> **THE SECTION IS ORGANISED BY THE THING BEING CONFIGURED.** It had grown
> five rows named after the mechanism — *Engine*, *Transport*, *Authoring
> model*, *Primary Reviewer*, and a row for the model catalog — so a
> developer had to already know that *Engine* meant what the authoring AI
> runs inside and *Transport* meant how a reviewer is reached. Two nodes
> replace them, each naming a participant: **Authoring AI** (Vehicle, Model)
> and **Reviewing AI** (Vehicle, Primary Model, Auxiliary Model). Every leaf
> reads a field the projection already carried after 152, save one.
>
> **THE AUXILIARY REVIEWER HAS BEEN DISPATCHABLE SINCE 152 AND HAD NO
> SURFACE.** Nothing showed what would adjudicate a disputed finding and
> nothing could choose it. It has a role node now, resolved through its own
> vehicle against the one rule that can be known between sessions — not the
> author — and `configure --auxiliary-model` selects for it. The rest of its
> definition, every provider that has already reviewed a round, is read from
> the session's record at the adjudication, so the node carries
> `narrowedAtDispatch` rather than letting a list drawn between sessions read
> as final. Both reviewing roles go through ONE check in `configure`, not two
> copies of it. A selection there still narrows and never widens: a model the
> round excludes is a stop that names it.
>
> **THE CATALOG ROW WENT AND ITS TWO ACTIONS PARTED COMPANY.** *Refresh* is
> the Configuration node's own action, with the record's age, path, command
> and cost moved into that node's tooltip; *View the JSON* is deleted — it
> opened a machine-written record in an editor and invited a hand-edit that
> survives until the next refresh replaces the block whole. The `openFile`
> seam went with it, since that command was its only caller.
>
> **THE DEFECT WAS NEVER THE CATALOG'S: NOTHING CAN WATCH WHAT THE
> PROJECTION IS DERIVED FROM.** `SolutionTreeProvider` watched six workspace
> paths and not one is a configuration input; the catalog and the preferences
> live at the USER level, outside any `RelativePattern`'s reach. It derived
> only over a MISSING file, so a projection that exists and is wrong stood
> until a manifest happened to move — which is how the pane spent session 152
> rendering a file eight minutes old. It now derives at activation whatever is
> on disk, and `dabbler discovery refresh` re-derives after it writes.
>
> **THE RUN OF RECORD CAUGHT WHAT A SINGLE-FILE RUN CANNOT.** Both new router
> tests load a config, which asks git where the repository is, and session
> 96's whole-suite preload refuses a spawned git — green through `node --test
> <file>`, red in the container. Each answers git from a table now. The
> framework's credential-free checks caught the same class one step earlier:
> the refresh test read THIS machine's `DABBLER_*_API_KEY` and enumerated
> three vendors for real; it takes them out of the environment and seams the
> seat, and went from 1.8 s to 0.5 s.
>
> **OWED, from the reviewer's Minor findings (both real).**
> 1. **Reviewing AI → Vehicle reads one thing and writes another.** The row
>    renders `primaryReviewer.vehicle`, which `roles.reviewer.transport` may
>    decide, while its action writes the machine-wide `transport`. That is
>    deliberate — one Vehicle row stands over both reviewing roles and only
>    the primary has a vehicle flag — and the row marks itself and names the
>    layer when a role override outranks it, but the mismatch stands and no
>    test covers the case.
> 2. **The refresh test proves re-derivation, not a NEW reading.** With the
>    machine's keys out of the environment no vendor answers, so the block
>    stands as it was; the assertion is that the projection agrees with the
>    catalog on disk. Proving it reads a catalog that CHANGED needs an armed
>    enumeration seam.
>
> ## SESSION 154 CLOSED, 2026-09-11 — one door into each suite, and the gate that had stopped being read
>
> | session | what | state |
> | --- | --- | --- |
> | 154 | the extension suite armed through either door, the refusal covering both runners, and a control that holds the gates to the declared suites | CLOSED VERIFIED at round 1, landed `9df2f829`, closed `58265b95`. **Not releasable** — the block ships from 156 |
>
> **CI had been red for eleven consecutive runs and nothing in this
> repository could see it.** `npm run test:unit` did not set
> `DABBLER_CATALOG_PATH`; a spec session 150 wrote required it; `257
> passing, 1 failing`. Sessions 150, 151 and 152 each closed **VERIFIED** on
> a run of record taken through `scripts/run-unit.mjs`, which armed the
> seam, while the gate behind the package's own npm door was red the whole
> time. **Nothing lied** — the framework read the door it was told to read.
>
> **THE SUITE HAD TWO DOORS AND TWO COPIES OF HOW TO RUN IT.** The arming
> lived in the runner alone because the runner was where somebody put it.
> It is now `.mocharc.json`, which mocha finds from the package directory
> whoever invoked it, and both doors are reduced to mocha plus their spec
> paths. `spec` is deliberately **not** in it: mocha MERGES a configured
> spec with an appended path list (D116), so a glob there would turn every
> targeted run into a whole-suite run. `src/test/machine-state.js` arms the
> catalog **and** the preferences, and `machineState.test.ts` is the whole
> proof for both doors — each proves itself by running it.
>
> **THE GUARD WATCHED ONE RUNNER OUT OF TWO.** `currentCatalogPath` refused
> this machine's own path only when `NODE_TEST_CONTEXT` was set, which
> `node:test` sets and **mocha does not** — so under the npm door an unarmed
> read did not stop, it returned the operator's real catalog and the suite
> read the machine it was running on. `underTestRunner` in `catalog.ts`
> states what a test run is **once**, for both records: `NODE_TEST_CONTEXT`,
> or a process whose entry point is inside a `mocha` package.
> `preferences.ts` imports it rather than restating it.
>
> **THE CONTROL IS THE REPAIR, on D257's precedent.** `check-ci-suites.mjs`
> could see that the runner a workflow names exists; it could not see that
> the runner a workflow names **is not the runner the framework runs**. Now
> every declared expensive suite must be run by some gate, and a difference
> between the two doors is legal only where `scripts/ci-suites.json` gives
> its reason — **declared, not forbidden**, because session 153 left a real
> divergence behind on purpose (a container locally, `windows-latest` in CI,
> because that is what proves the platform) and a check that forbade every
> one would have been deleted a session later. A declared divergence no
> workflow runs is refused too: the excuse must not outlive the difference.
> `scripts/check-ci-divergence.mjs` proves the rule against canned inputs,
> including the case it must **refuse**.
>
> **AND THREE PROTECTIONS WERE RUN BY NOTHING AT ALL.** Session 153 wrote
> `check-suite-membership.mjs` and `check-cancelled-guard.mjs` and left them
> named only in comments — no control declared them, no workflow invoked
> them, and both passed by nobody asking. That is this session's own defect
> one layer down. All three now ride in the lint control, which is
> `required` and runs every session, and `scripts/` maps to `select: []`
> rather than to nothing, because a control answers for itself by running.
>
> **Verification passed at round 1. Three suites as the run of record** —
> host 1.8 s, container 32 s, extension 22 s — and the extension suite is
> **259 passing, 0 failing** where it was 257 and 1.
>
> ## SESSION 153 CLOSED, 2026-09-11 — the suite runs where process creation is cheap, and what cannot follow it is declared rather than discovered
>
> | session | what | state |
> | --- | --- | --- |
> | 153 | a Podman runner for the platform-independent tests, a host suite for what proves Windows, and a guard that will not read a cancelled test as a pass | CLOSED VERIFIED at round 2 (round 1 blocked on one real thing), landed `42c4397c`, closed `46d8a5c9`. **Not releasable** — the block ships from 156 |
>
> **324 seconds became 26.4.** Measured this session on this host: the whole
> suite as `dabbler.yaml` declared it before, 324 s / 1,179 tests; the two
> doors now, 24.6 s for the container's 1,129 and 1.8 s for the host's 50.
> The mechanism is process creation, not saturation — a bare `node -e 0`
> spawn costs 158.8 ms here and 18.9 ms in the WSL2 machine. **The session's
> own run of record went through it: 28 seconds.** Only this repository
> declares any of it — nothing in the shipped framework changed and no
> default moved, because the next repository to adopt this is .NET or Java.
>
> **THE SEAM IS ONE FILE, AND MEASURING IS WHAT MADE IT ONE.** Four files
> failed in the container on the first pass. Three were the image, not the
> platform: `checks.test.ts` and `engines.test.ts` because an orphan with no
> PID 1 to reap it stays a **zombie**, which `kill(pid, 0)` answers for
> exactly as it answers for a live process, so the test reads a reaped tree
> as a surviving one; `walk-jobs.test.ts` because `node:22-slim` carries no
> `ps`, so the POSIX branch of `survivors()` found no process table and
> reaped nothing while saying nothing. `--init` and `procps` fix all three.
> Declaring them host-only would have written down "this proves Windows"
> about three tests that prove no such thing, and left the container quietly
> not proving the job runner's leak reaping.
>
> **`copilot.test.ts` is host-only for a reason that is owed forward.** It
> spawns nothing and needs no seat: `sleep()` in
> `src/transports/copilot.ts` **unrefs its deadline timer**, so when the
> spawner never settles nothing holds the event loop open and the deadline
> never fires. Windows keeps it alive, Linux does not — so those tests pass
> here by luck, and a deadline that only fires when something else happens
> to be keeping the loop alive can fail to fire in production. Not fixed:
> this session declared that nothing in the shipped framework changes.
> **`docs/design/suite-runners.md` carries it for a later session.**
>
> **Declaration ORDER is load-bearing.** Both doors name the same
> `test_roots`, and `scopeForTest` gives a file to the FIRST matching suite.
> Declared the obvious way round, `typescript` claimed `copilot.test.ts`,
> the container declined it, and **no targeted command ran it anywhere** —
> the one test the split exists to keep proving. `dabbler affected` printing
> one command where there should have been two is what caught it.
> `typescript-windows` is declared first and selects by a glob that names
> the file; `check-suite-membership.mjs` holds that glob to the manifest and
> refuses a manifest one glob cannot express.
>
> **A cancelled test is not a pass**, on both doors, named with its file.
> Building the guard found that the host door emitted `spec` output, which
> carries no `failureType` — so the guard was **blind there** until
> `--test-reporter=tap` was asked for rather than inherited.
>
> **ROUND 1 CAUGHT THE SAME DEFECT TWICE, BOTH MINE.** The volumes were
> accepted because a marker existed, so a moved `package-lock.json` would
> never reinstall and the suite would run green against the previous
> branch's dependencies; they now carry a sha256 of the lockfile they were
> built from, written only after `npm ci` succeeds. And the image was cached
> by tag alone, so editing the `Containerfile` changed nothing — it now
> carries that file's digest as a label. Both are the same shape: **an
> artefact accepted because it exists rather than because it is current.**
>
> **Five tests skip in the container that the host would run** — three
> `.cmd`-shim resolutions, one `taskkill`, one that cannot raise its worker
> priority. Their files hold too many platform-independent tests to move, so
> nothing local proves those five and **CI on `windows-latest` is what
> does**. That is the declared divergence, concretely, and it is session
> 154's input.
>
> **The commit message on `42c4397c` still carries 360 s / 17.7 s / 1,067
> tests.** The declaration is recorded before the work, and those were the
> plan's figures; the measurement superseded them and
> `docs/design/suite-runners.md` says so in its own words.
>
> ## SESSION 151 CLOSED, 2026-09-11 — one reading, one rule, and the model on the screen is the model that runs
>
> | session | what | state |
> | --- | --- | --- |
> | 151 | three verifier-selection rules deleted and one kept, the model registry deleted behind the catalog, a chosen model made a pin the runtime honours or stops on, and the authoring row wired to the thing that actually authors | CLOSED VERIFIED at round 2 (round 1 blocked on two real things), landed `1100ac86`, closed `db34f2a9`. **Not releasable** — the block ships from 152 |
>
> **The offer and the check are one reading.** `projection.roleReading` is
> exported and `dabbler configure` resolves through it, so the models the
> verb accepts are exactly the models the pane offered on that machine.
> They were two lists: the verb walked the model registry whatever the
> transport was, and on a seat — whose models were never in it — refused
> every model the pane had just listed. `aliasFor` and `modelIdOf` are gone
> with the round trip they served: the catalog's id is what is shown,
> checked, written and dispatched.
>
> **One rule survives and it needs no judgement: the verifying model may not
> be the authoring model.** Two ids compared under the framework's one
> spelling, so a dated pin and its undated id are the same model.
> `verifierRefusal`'s tier floor, the `is_enabled_as_verifier` deny list and
> `capability_tier` are deleted — the floor had never applied on a seat
> anyway, since `tierRank` keyed by registry alias and a seat candidate is a
> plain id. Cross-provider is a LABEL now: **different provider** / **same
> provider** / **provider unknown**, with one line of help, in one
> vocabulary read by both the row and the pick.
>
> **The registry is gone.** `models:` and `capability_tiers:` left the config
> and the schema; `registryEnumeration`, `explainRegistryCandidates`,
> `registryCandidates`, `untrustedAsVerifier`, `tierRank` and the old
> `verifierRefusal` left `selection.ts`. What was load-bearing became
> `provider_defaults` — max output, context window, system prompt file and
> generation params **per provider, with no model names in it**, so it
> cannot go stale when a vendor ships something new. `task_type_params` is
> re-keyed the same way. **The plan's premise about identity was FALSE and
> checking it first is what caught it**: the catalog fallback was
> `confirmedCatalogEntries`, which reads the SEAT block only, so on a machine
> with keys and no seat the deletion would have left `resolveModelProvider`
> answering nothing for every model. It reads both scoped blocks now.
>
> **A chosen model is a pin, not the front of a preference order.** The
> surface wrote a choice into `roles.<role>.prefer` while the dispatch
> resolved that role with the authoring model's provider excluded, so a
> deliberately chosen same-provider verifier was dropped and something else
> answered with nothing said. `effectiveExclusion` is the one reading of what
> a call may not draw from — empty where somebody pinned, the caller's
> exclusion where nobody did — and an unmet pin resolves to NOTHING rather
> than the next candidate, because falling through IS the substitution the
> pin exists to stop. The stop names the model, why this machine cannot reach
> it, and the command for each way forward.
>
> **The pane had two authors and filtered against the wrong one.**
> `ROLE_GENERATOR` was dispatched by nothing — `route()`'s fallback, named by
> none of its four callers — so it is deleted with `roles.generator`, and
> `route()` now refuses a call that names no role. The authoring row REPORTS
> the orchestrator's engine and model off the ledger, narrowed to the
> providers that engine's CLI can run (`MULTI_PROVIDER_ENGINES`' distinction,
> which no surface had ever read), and `configure` loses `--authoring-model`:
> the model is declared at `session start`, so the pane says so rather than
> offering a choice the ledger will not honour.
>
> **ROUND 1 CAUGHT TWO REAL HOLES.** A pin outlives the session that set it,
> so `configure` could only check it against the author of the day it was
> written — the next session declares that model at `session start` and the
> pinned verifier IS the author. `assertNotTheAuthor` now runs per candidate
> beside `assertNotExcluded`, in the rule's own words: **a rule the surface
> keeps and the runtime does not is not a rule.** And the catalog reading had
> dropped `providerReachable` from the direct-API path on the argument that
> an out-of-scope block reads as unread — true, and NOT the same guarantee,
> because the scope moves all at once and says nothing about this provider
> being keyed now. It is `apiSelectableModels` in `discovery.ts` and it
> belongs to that path alone: my first attempt put it in the shared
> enumeration rule and broke the seat, which holds no provider keys at all —
> the "nothing resolves" defect 145 shipped.
>
> **TWO THINGS FOUND ON THE WAY.** The extension's suite reads the BUILT
> router, so `npm run build -w dabbler-ai-router` has to run before it proves
> anything about source. And 150's catalog guard keys on `NODE_TEST_CONTEXT`,
> which `node:test` alone sets, so the extension suite was reading the
> OPERATOR'S OWN catalog; its runner now points `DABBLER_CATALOG_PATH` at a
> temp file for every spec. Session 150 also left one extension test red
> against the freshness rows it had collapsed — step 6's own check ran that
> file, which is how it was found and closed.
>
> ## OPEN FOR 152 — the walk on both transports, and the release
>
> 152's plan stands. Two notes for it: the pane's authoring row is now a
> REPORT, so the walk should confirm it reads the engine's declared model and
> that `Set authoring model` says where it is really set; and the direct-API
> list is the vendors' own 196 ids less the 70 non-chat families the id rule
> excludes, so the walk on that transport is the first time a person sees
> that list instead of 14 curated aliases.
>
> ## SESSION 150 CLOSED, 2026-09-11 — one catalog, at the user level, and nothing in that path can bill a token
>
> | session | what | state |
> | --- | --- | --- |
> | 150 | the two model records replaced by one `ai-model-catalog.json` per machine, the prompting probe deleted, three freshness rows collapsed to one, and the Configuration pane given one row with two actions | CLOSED VERIFIED at round 2 (round 1 blocked on one real thing), landed `f5149963`, closed `cffae499`. **Not releasable** — the block ships from 152 |
>
> **The catalog is one user-level file and nothing ships.**
> `%LOCALAPPDATA%\dabbler\ai-model-catalog.json`, or the XDG equivalent, one
> block per transport, written only for a transport the machine has. The
> tracked `copilot-catalog.lock` is gone from git, from the router manifest's
> `files` and therefore from the VSIX; `.dabbler/api-models.lock` is gone;
> `lockfile.ts`, its test and `smol-toml` went with them. Both records were
> derived and free to rebuild, so neither was migrated. `catalog.ts` takes
> `lockfile`'s place in `boundaries.json`, under `platform`.
>
> **A block is believed only for the machine it was read on, and that is the
> whole point.** Round 1's blocking finding was right and it was a judgement
> I had made deliberately: I had the scope check as the REFRESH's question
> and gave readers an unscoped `blockOf`, so a block recorded on another
> account stayed believed until a refresh replaced it — and a refresh that
> failed, or had not run, left that account's models dispatchable. There is
> one reading now, `blockFor`, and no second one to reach for: routing, the
> pane, drift and freshness all refuse a block recorded for another seat or
> another key set. The seat's identity is read free from the CLI's own
> `~/.copilot/config.json` (`lastLoggedInUser`), which is the only statement
> of it there is — the ACP reply names models and never the account.
>
> **The probe is deleted and nothing under the catalog can dispatch to a
> model.** `discoverModels`, the scopes, the projection, the confirmation
> prompt and the 720-hour clock are gone, and with them `echoed_model`,
> `confirmed_at`, `confirmed_on_cli_version`, `probed_at`,
> `premium_request_weight`, `probe_premium_requests`, `last_probe_at`,
> `last_probe_error`, the `confirmed`/`listed` split and `echoObservations`.
> Fidelity reads a verification round's own requested/served pair, which is
> evidence the framework already produces for nothing. `dabbler copilot
> refresh` keeps the free reading and lost every flag that selected models to
> prompt.
>
> **The price category was read free on every refresh and thrown away.** The
> seat states `copilotUsage`, `copilotEnablement` and `copilotPriceCategory`
> for every model it lists; the writer kept two and dropped the third.
> `price_category` is now stored verbatim under the seat's own name for it,
> beside a `cost` carrying the multiplier, the text the seat stated and the
> platform that bills it. Where a source states neither — every vendor model
> on the API path — both are null and nothing is guessed.
>
> **One row, one verb, one answer about cost.** `checkFreshness` returns one
> `ai-model-catalog` row aged against the oldest block the machine holds;
> `api-enumeration`, `seat-catalog` and `seat-list` are gone.
> `dabbler discovery enumerate` became `dabbler discovery refresh` and covers
> every transport the machine has. `REFRESH_COST` has one entry and it says
> *Nothing*. The Explorer row carries *Update the Catalog* and *View the
> JSON*, both taking the router's own command and the router's own path.
>
> **The daily refresh is a DAY, not an age**, on whichever transports the
> machine has — a transport it holds no credential for is not a stale reading
> to chase, which is what reopened the seat at every session start of a
> keyless machine (round 1's nit, and a real cadence defect).
>
> **THE LIFECYCLE LOCK'S WAIT WAS SHORTER THAN ITS OWN HOLDS.** The run of
> record failed on `walk-impact`, and it failed identically at HEAD with this
> session's work stashed — pre-existing, not this session's. Measured on the
> suite's own load, sampling every `.lifecycle.lock` once a second: four
> locks held **14, 17, 18 and 31 seconds** by processes alive the whole time
> and released normally afterwards. The waiter gave up at 30, so a slow
> winner read as "the lifecycle lock is contended" — true of nothing.
> `LOCK_WAIT_SECONDS` is 180 now, six times the worst hold; a holder that
> DIED is still reclaimed in a quarter of a second by the staleness check.
> **This is not the 149 pid trap** — the pid theory was wrong and the
> measurement disproved it.
>
> **Three machine facts the suite must never read**, each with a seam armed
> in `test/support/repo.ts`: `setCatalogPath` (a test wrote a fixture seat
> into the operator's real catalog before the guard existed),
> `setSeatSource` (day-zero reading means a session start opens the seat, and
> a machine with the CLI installed would spawn it from a test about something
> else) and `setSeatIdentity`. `currentCatalogPath` REFUSES the machine's own
> path under the test runner rather than defaulting to it, which is how two
> of the three were found.
>
> ## OPEN FOR 151 — the registry, the one rule, and the pin
>
> Session 151's plan stands unchanged and its ground is now clear: the
> catalog is the inventory, `explainRoleCandidates` takes `CatalogModel[]`,
> and `seatBlock()` / `apiBlock(config)` are the two scoped readings to build
> on. Its step 8 still owns the "entitlement, not existence" sweep —
> `AGENTS.md`, `docs/model-and-pricing-sources.md`, `README.md`,
> `docs/quick-start.md`, `docs/acp-walkthrough.md` and `docs/model-fidelity.md`
> all still describe a probe that no longer exists and a
> `dabbler discovery enumerate` that is now `refresh`.
>
> ## SESSION 149 CLOSED, 2026-09-10 — the flake that refused a release, the gate that could not pass, and 2.1.3 published
>
> | session | what | state |
> | --- | --- | --- |
> | 149 | the walk-jobs flake diagnosed and its cause removed, the candidate gate given a runner that exists, and the publish taught the difference between a refusal and the weather | CLOSED VERIFIED at round 2 (round 1 blocked on two real things, both fixed), landed `ccbf9fee`, closed `253f8352`. **`vsix-v2.1.3` is TAGGED AND PUBLISHED** — the Marketplace serves 2.1.3, confirmed by `dabbler release --verify-install` |
>
> **A pid is a number, not an identity, and that is the whole of the flake.**
> `walk-jobs`'s "ends a running job and everything under it" watched a process
> id to decide whether a job's fork had been taken down. Measured under this
> suite's own load: **14 of 150 freed pids (9.3%) read as alive again within
> forty seconds**, held by unrelated processes, so `process.kill(pid, 0)`
> answers "is there a process with this number" and a recycled number reads as
> the job's fork forever. No deadline rescues that, which is why raising the
> ten seconds to the twenty beside it would have bought nothing — the
> `vsix-v2.1.0` publish would have refused ten seconds later. A fork now
> appends to a heartbeat while it lives and *gone* is the heartbeat stopping,
> which the OS cannot hand to somebody else. `docs/design/job-tree-kill.md`
> carries the measurement.
>
> **The product-side theory was ruled out by measurement, and the blind spot
> was fixed anyway — the verifier was right about that.** Fourteen loaded tree
> kills all returned `SUCCESS` and none left a survivor, so `terminateTree`
> did not cause this. But a kill that failed and a kill that worked were
> reported identically, and a job is ended from a router process that never
> held it, so nothing else would ever notice. `terminateTree` returns
> `TreeKill` now; `endJob` retries once, then ends the runner directly and
> says what it could not reach. `setTreeKiller` is the seam, because a machine
> that cannot spawn a process cannot be asked for one.
>
> **A gate is proved by running and by nothing else.** The candidate gate ran
> `node node_modules/vitest/vitest.mjs` from session 88's retirement of vitest
> until now — a package in no manifest and no lockfile entry, so the gate that
> fast-forwards the trunk could never have gone green, and `drive.ts` waits
> twenty-five minutes on it. `check-ci-suites.mjs` rides in the lint control
> and refuses any workflow naming a runner or an npm script this repository
> does not have; it caught the live defect on its first run.
>
> **The publish now knows a refusal from the weather — and it was needed the
> same hour.** `publish-marketplace.mjs` asks the gallery (free, no
> credential) what it holds before uploading and after any failure, retries a
> timeout or an unreachable gallery, and stops at once on a refusal. Round 1
> caught the real hole: an unreadable gallery after an upload is **`unknown`,
> not `absent`**, and treating it as absent is how a correlated outage turns
> one upload into two. It fails closed and says re-run me.
>
> **The Marketplace was genuinely down for about fifteen minutes.** 2.1.3's
> publish job hit `Request timeout: /_apis/gallery` on all four attempts, each
> at exactly 180 s, confirming 2.1.3 absent between every one — so nothing was
> double-sent. A re-run of that same job published in **11 seconds**, which is
> the recovery path the design intends: no tag re-push, the script asks first.
> vsce was unchanged since 2.1.1 shipped successfully at 16:45, so this was
> the far end. **2.1.0 and 2.1.2 remain tagged and unpublished**; 2.1.3
> supersedes both and the changelog says so for anyone comparing tags against
> the Marketplace.
>
> **Owed to 150, from round 2 (a nit, not dispositioned):** `treeKillCommand`
> sets `stdio: "ignore"`, so a real `spawnSync` returns no `stderr` and
> `terminateTree`'s "already gone" branch (`/not found|no running
> instance/`) is unreachable in production — a process that exits between
> `endJob`'s `alive()` check and the `taskkill` is reported as a failed tree
> kill rather than an ended one. The test passes only because the seam
> supplies output production discards. Pipe the tree kill's output and assert
> the options carry it. Not fixed here: the session was at the publish gate,
> and editing the tree there is the deadlock family this repository has
> already paid for twice.
>
> ## OPEN FOR 150 — the Configuration pane's model records
>
> **Read `docs/design/model-catalog.md` before touching the Configuration
> section.** Raised by the operator on 2026-09-11 against 2.1.3, measured on
> a seat-only machine, and deliberately NOT fixed here — it is to be
> implemented on the machine that has both direct-API keys and a Copilot
> seat, which is the only place the multi-transport refresh can be walked.
>
> Three things, one root:
>
> 1. **The pane offers models `dabbler configure` then refuses.** 146 moved
>    the pane's enumeration to the transport that is in force;
>    `cli/configure.ts` never got that fix and still validates every choice
>    against the direct-API registry. Measured: **10 of 18** offered
>    authoring models and **7 of 12** offered verifying models are refused,
>    with a message listing registry aliases the operator has never seen.
>    Whether a seat model passes turns on whether the registry's `model_id`
>    happens to be spelled the same way — `claude-sonnet-5` passes,
>    `claude-haiku-4.5` does not, because `haiku` carries a dated pin.
> 2. **"Entitlement, not existence" is stale.** Session 148 established that
>    the seat states `copilotEnablement` for free and made `listed` a
>    selectable state; the probe's unique payload is **fidelity**, not
>    entitlement. Three places still say otherwise — `AGENTS.md`,
>    `docs/model-and-pricing-sources.md`, and `REFRESH_COST[RECORD_SEAT]` —
>    and reading any of them makes an engine reason wrongly about cost. It
>    has now caught a fourth.
> 3. **Three record rows named for their implementation.** `seat-catalog`
>    and `seat-list` are two dates on one file; `api-enumeration` is a file
>    that never exists without provider keys and so reads stale forever.
>
> **The operator's direction:** one `ai-model-catalog.json` keyed by
> transport, replacing all three rows with a single Solution Explorer entry
> carrying one "last updated", a right-click to refresh or view, refreshed
> automatically on the first session of a day, and only for the transports
> active on the machine doing the refresh. The proposal is quoted in full in
> the design page, with a recommendation to adopt it and seven notes on the
> details — the load-bearing ones being that the refresh must MERGE rather
> than replace (or the first seat-only laptop strips the API models for
> everyone on the next VSIX), that the declared registry stays separate from
> the observed catalog (or a daily refresh rewrites the operator's judgement
> about who may verify), and that `costFactor` must name its billing
> platform in the file.
>
> ## SESSION 147 CLOSED, 2026-09-10 — the stop a developer can act on, and 2.1.1 published
>
> | session | what | state |
> | --- | --- | --- |
> | 147 | a stop that says what refused, who acts, what each way on costs and the command for it; the reason on the terminal it points at; a standing dispute put to the operator as a question; and no button that runs the engine's command | CLOSED VERIFIED at round 3 (rounds 1 and 2 each blocked on something real), landed `79c1fb66`, closed after. **`vsix-v2.1.1` is TAGGED AND PUBLISHED**: the operator authorised it in-session and CI published `DarndestDabbler.dabbler-ai-orchestration v2.1.1` without waiting on a reviewer |
>
> **The fault this session exists to end: one sentence served ten unlike
> stops.** `Next: you. Read the round's reason above and put it right, then
> <resume>.` was `driver.ts`'s answer to every bound the loop can meet — over a
> stop whose actor was the ENGINE, pointing at a reason no surface had shown,
> naming nothing to put right, with a command that reads as starting something.
> A stop now renders four things: `happened` (the record's own reason, after
> the situation's sentence), `actor` (`engine` | `operator` | `either`, a field
> and not a word inside prose), `choices` (label, cost, command — best first),
> and `ways`, the one formatter every surface prints them with.
>
> **A stop's kind is the bound it met; `code` is which refusal it was.** New
> closed vocabulary on `run.json`: `no-verdict`, `provider-unreachable`,
> `dispute-refused`, `cap-unresolved`, `cap-disputed`,
> `cap-terminal-tree-moved`. Absent is legal and means the kind is the whole
> stop — every run written before this carries none. A new refusal is named in
> `driver-run.schema.json` before it can be recorded, so no site can invent a
> slug that reaches a surface unrendered.
>
> **`recordDispute` hands back the words it refused in.** It returns
> `{exit, refusal}` now: the driver files the engine's disputes, and an exit
> code alone put `refused (exit 2)` on the record while the sentence that
> actually refused it — an evidence file over the 16 KB inline cap, which is
> the stop that started all of this in 144 — went to a stream nothing kept.
>
> **A standing dispute is put to the operator before anything is spawned.**
> `phaseVerify` reads `cap-disputed` off the record, and the stop carries a
> BRIEF — each contested finding, the grounds filed against it, what that
> argument cites — which rides to the stop's own owed decision and never to
> `run.json`, because the reason there is what the deadlock classifier
> compares. The refusal's words are `capDisputedRefusal`, read by both `verify`
> and the driver, so the two readers of one state cannot disagree.
>
> **`Resume Session` is withheld while the stop is the engine's to clear.** The
> projection names `stopActor` on the in-flight row (`standingStopActor`, the
> same reading the blocked task row folds), and the Work Explorer keys on it.
> `session run` calls `next`, and one instruction has exactly one caller: the
> operator clicked that button at a stop that was the engine's and became a
> second driver on a live loop. Every other state keeps the action it had.
>
> **What the rounds caught, and all of it was real.** Round 1: the terminal
> dropped the stop's `code` on its way to `renderStop` (so a `cap-disputed`
> stop read as the engine's and offered `session next`); the driver's own
> stderr printed three of the four things it knew; and a provider that could
> not be reached was still collapsed into `no-verdict`. Round 2: the terminal
> line carried only the FIRST command and no costs at all. Both were fixed at
> the source — `ways` is formatted once in `driver.ts` and printed by the
> driver's stderr and the terminal alike.
>
> **Owed to 148, from round 2 (a nit, not dispositioned):** no test drives
> `phaseVerify` through an actual `EXIT_CALL_FAILED` verification result to
> prove the persisted stop code is `provider-unreachable` rather than
> `no-verdict`; the mapping is asserted only at the rendering. `EXIT_UNAVAILABLE`
> is deliberately NOT read as unreachability — three unlike causes share it —
> and if that is to change, `verify` needs an exit of its own first.
>
> **Still owed from 146:** prove that refreshing the seat's LIST preserves an
> existing confirmation, and give the seat-transport projection test a fixture
> catalog so its retirement assertion cannot go vacuous.
> ## SESSION 146 CLOSED, 2026-09-10 — every model list is free, and the code now says so
>
> | session | what | state |
> | --- | --- | --- |
> | 146 | the seat's own list read free over its protocol, the free records refreshing themselves at session start, a withdrawn model marked rather than dropped, every cost naming its billing platform, and the pane offering a seat's models on a seat | CLOSED VERIFIED at round 2 (rounds 2 and 3 nits only), landed `9ddb7434`, closed `89acf1a4`. **`vsix-v2.1.0` is TAGGED AND PUSHED**: the operator authorised the publication in-session, so the Marketplace waits only on CI's reviewer |
>
> **The finding this session exists to stop being re-derived: enumerating models
> is free on every surface.** `session/new` over `copilot --acp` answers with
> `models.availableModels` -- measured again here on 2026-09-10, CLI 1.0.83: 28
> entries in 3 seconds, no token, no credit, 27 models plus the seat's own `auto`
> alias. The maintained catalog had 18: sixteen models it had never heard of,
> seven it carried that the seat no longer serves, and five sampled costs that
> disagree with the seat's own statement. `enumerateSeatModels` is the reading,
> `dabbler copilot refresh --list-only` is the free scope that records it, and
> `docs/model-and-pricing-sources.md` carries the measurement with its date.
>
> **The probe is kept for entitlement and can no longer enumerate.** It neither
> adds an entry nor removes one; `candidate_universe` is written from the free
> reading and the file's own stale note -- the sentence three engines reasoned
> from -- is rewritten by the writer, because hand-editing that file is what the
> digest exists to catch.
>
> **Two records, two clocks, one of them free.** The seat catalog holds what the
> seat lists (free, `enumerated_at`, 24h) and which models answered (a billed
> turn each, `probed_at`, 720h), and they are dated separately because while
> there was one row the free half inherited the priced half's month. Both free
> records now refresh themselves before a session's work: `refreshStaleRecords`
> re-reads the API record and the seat's list at `session start`, best-effort,
> never blocking, and with no priced call in the path at any age.
>
> **Marked, never deleted.** A model an answering vendor stops returning keeps
> its entry, its last-seen date and a `retired_at`; it stops being offered, shows
> up in `dabbler discovery drift`, and is offered again if it comes back. One bad
> enumeration cannot remove the only verifier a role had. `retiredModels` is the
> one reading the drift diff and the pane's offer both go through.
>
> **145's defect is fixed where it belonged.** `roleReading` takes the enumeration
> from the transport in force -- the seat's confirmed catalog on `copilot-cli`,
> the registry on `api` -- and hands it to the same `resolveRole`. Walked live:
> with no `DABBLER_*_API_KEY` set at all, the seat path offers 11 authoring
> candidates and withholds 4 retired ones; every row says which record it read.
>
> **A held release had no forward path, and now it has one.** An answer is
> settled, so 2.1.0's *not yet* could never be asked again and the release stayed
> held after the defect was fixed. `dabbler release --reask --reason <why>`
> supersedes the hold and re-raises the same brief; it authorises nothing, and it
> refuses to re-ask an answer that already authorised a tag. The fold also stopped
> carrying an old answer across a fresh `raised` row, which would have left a
> re-asked release reading as settled.
>
> **What the rounds caught.** Round 1 found both blocking things above (the free
> seat list not refreshing, and `--stale` able to spend a billed probe on a model
> just marked retired) and one nit that was factually wrong -- disputed with the
> lockfile's own lines, and WITHDRAWN by the verifier in round 2. The run of
> record then caught two new tests shelling out to git through `loadConfig`'s
> project-root lookup: **a suite may not read the machine it runs on**, and the
> same lesson landed twice this session -- a step check refused two tests that
> inherited `DABBLER_TRANSPORT` from the operator's environment.
>
> **Owed to 147, from rounds 2 and 3 (nits, no findings):** prove that refreshing
> the seat's LIST preserves an existing confirmation (the test only shows
> unconfirmed rows), and give the seat-transport projection test a fixture catalog
> so its retirement assertion cannot go vacuous when the shipped one has no
> retired entry.
> ## SESSION 145 CLOSED, 2026-09-10 — the configuration an operator sets once, and the seat gap it uncovered
>
> | session | what | state |
> | --- | --- | --- |
> | 145 | a Configuration section in the pane: engine and transport as two controls, the two models from the registry, each dated record with its age and its cost, and every model carrying what the record says about it | CLOSED VERIFIED at round 3 (rounds 1 and 2 each blocked on something real), landed `a42a42e1`, closed `5d67dff2`. **2.1.0 is stamped and NOT tagged**: the operator answered `publication:2.1.0` with *not yet*, and releasability was withdrawn on the record |
>
> **OWED, and it is the first thing session 146 does: the model list is wrong
> on a Copilot seat.** Both role rows come from `explainRegistryCandidates`,
> which enumerates the DIRECT-API registry and keeps only models whose
> provider API key resolves. On the seat path the enumeration is the seat
> catalog — `selection.ts` says so in its own header — so on a machine with a
> seat and no `DABBLER_*_API_KEY` the pane reads "nothing resolves" for both
> models while the catalog holds eighteen working ones. **That is the
> operator's staff's machine**, and it is why 2.1.0 is held. `resolveRole`
> already takes candidates from either transport and `confirmedModels`
> is the seat's enumeration, so the fix is one function, not a redesign.
>
> **Owed beside it: nothing shows drift.** `dabbler discovery drift` already
> answers "which models your roles name that the dated record does not have",
> and no surface renders it — so a retired model sits in the list looking
> perfectly selectable. One row's work, and it is the row that makes the list
> trustworthy rather than merely honest.
>
> **What the pane does today.** The router decides and writes a
> `configuration` block into the solution projection; the extension renders it
> and derives nothing. Transport carries the LAYER that decided it and says
> when something above the file is shadowing the operator's choice — the
> failure this repository has already had. Engine is this extension's own
> setting, because `session start` takes it as an argument, and Start Session
> offers it first; the pane refuses to persist an engine Start Session cannot
> launch (`codex`). Nothing probes on open: each record row shows its age and
> what a refresh costs, and clicking one confirms and then runs the router's
> own named command in a terminal.
>
> **Two constraints on a verifying model, both surfaced rather than
> reinvented.** Same-provider is refused from the exclusion the dispatch
> itself applies; below-tier is refused from `capability_tiers`, an ORDERED
> list now declared in the registry, with an absent tier read as unknown and
> never as unsupported.
>
> **Fidelity is on every model, per transport, and the three answers read as
> three.** Observations come from the archived rounds filtered to the
> transport in force plus the seat catalog's echoes, weighed as 144 requires:
> only a provider's served id makes a model read `honoured`, an echo never
> can, and `not-known` is most of the list. **Round 1 caught the pane's own
> version of that promise being broken** — the row said it and the QuickPick
> you actually choose from did not.
>
> **D273: 2.1.0, and the plan section that said 2.0.23 corrected rather than
> obeyed.** Rounds 1 and 2 both blocked on the version. The dispute was
> overruled on a fair point — a classification error in prose does not amend
> a number stated twice, and the amendment lived in the accepted work plan,
> which a verifier reading the session plan cannot see. So the plan section
> was corrected with the reason inside it: 2.0.23 went stale when 142 released
> 2.0.21, and from there the patch successor is 2.0.22 and the minor 2.1.0.
> **The lesson: an amendment a verifier cannot see is not an amendment.**
>
> **The import-cycle control earned its keep.** The archived-rounds reader was
> put in `verify/rounds.ts` and made `projection → verify` a cycle; it belongs
> in `ledger.ts`, which owns `rounds.jsonl`. The deterministic controls
> refused round 1 before a verifier was paid to notice.

> ## SESSION 144 CLOSED, 2026-09-10 — the model that answered, and the three findings that were right
>
> | session | what | state |
> | --- | --- | --- |
> | 144 | the fidelity measurement, `modelFidelity`'s three answers, the round's substitution note, and 145's premise corrected | CLOSED VERIFIED at round 5 of a reopened cap (rounds 1–3 each found something real; the cap terminal was bought out with `verify reopen --rounds 3`, approved by the operator), landed `d13f8c4c`, closed `5b350e19`, not releasable |
>
> **The plan's premise was false and the session amended rather than built.**
> It said what was asked for and what answered are two facts of which only one
> is recorded. In fact `RouteResult` has carried `served_model_id` for some
> time, every round has written `requested_model` beside `served_model` since
> the 364-request session, `metrics.ts` keys a summary on the pair, and the API
> transport already compares them per call. **What had never happened was the
> reading.**
>
> **Three verification rounds, three real findings, two of them defects that
> would have shipped.** This is the session to point at when anyone asks what
> cross-provider verification is for.
>
> 1. **An exact seat echo was classified `honoured`** while the document
>    beside it said an echo is not evidence. The code was the half that was
>    wrong.
> 2. **`roundObservations` marked every round's `served_model` as the
>    provider's word** — including rounds run on a Copilot seat, where that
>    same field carries the CLI's echo. That laundered an echo into evidence
>    by wrapping a round around it: the very substitution the rule refuses,
>    one level up.
> 3. **The four probe calls I argued were unnecessary found a bug nothing else
>    could.** OpenAI answers `gpt-5.4-mini` with `gpt-5.4-mini-2026-03-17` — a
>    DASHED dated pin — and `datedPinOf` recognised only `-20260317`. **Every
>    dashed pin would have been reported to an operator as a substituted
>    model.** The 98 archived rounds cover two models, neither pinned that way,
>    so no amount of reading them would have found it. **The dispute was
>    well-argued and wrong**; that is worth more than the code.
>
> **The rule, and it is asymmetric.** An echo can never establish fidelity —
> a seat that ignored `--model` and echoed the request prints exactly what an
> honoured one prints. An echo CAN establish a substitution: a seat naming a
> different model is testifying against its own interest. Only a served id,
> the provider's own statement from its response body, makes a model read
> `honoured`. **So the seat's fifteen models read `not-known`**, and that is
> what 145's pane must render — not an absence of a problem, and not approval.
>
> **Three answers, never two.** `honoured`, `substituted`, `not-known`. A
> model nobody has asked for and one that answered as something else are
> different facts, and a boolean would have to call one of them the other.
> `not-known` is the COMMON case.
>
> **`verify reopen` works, and the close proves it did.** The cap terminal at
> round 3 landed the fix unreviewed; the operator authorised three more rounds;
> the reopen recorded the grant and the loop went on to land and close anyway,
> because the driver had already left the verify phase. **The close caught
> it** — `verification_clean` refused with "the grant bought a review; it is
> not one. Run it" — and one `dabbler verify` later, round 5 was VERIFIED. The
> gate did exactly what it exists for; nothing was papered over.
>
> **OWED, and it is session 146.** The operator reported the stop message as
> "clear as mud", on TWO surfaces: the Dabbler Terminal and a VS Code toast
> with an action button they clicked. `driver.ts:1365` renders one sentence —
> *"Next: you. Read the round's reason above and put it right"* — for an
> adjudication, a refused dispute, a provider outage and a cap terminal alike.
> The reason it points at is not on the terminal; "put it right" names no
> action; `dabbler session next` reads as starting something; and **it says
> "Next: you" when the actor is often the engine** — the refused dispute in
> this very session was mine to fix, caused by an evidence path over the 16 KB
> inline cap. A clickable toast also makes a person a SECOND caller of `next`,
> which the one-caller rule forbids.


> ## SESSION 143 CLOSED, 2026-09-10 — the terminal held to one rule
>
> | session | what | state |
> | --- | --- | --- |
> | 143 | every phase in the milestone tone, one gate renderer for the close and the packaging run, marks painted in a job's bytes, and the missing step line driven rather than guessed at | CLOSED VERIFIED (rounds 1 and 2, no findings either time; verifier `gpt-5-6-terra`/openai, transport `api`), landed `7e5861f1`, not releasable |
>
> **The step line does not reproduce, and three things were driven before
> that was said.** The built `dist/extension.js` carries the emission;
> `vsix-v2.0.20`'s own tree carries it, so the released build an operator
> installs has it; and a new test replays session 142's whole succession --
> seqs 1 to 24, nine step instructions among waits, a rejection and a done,
> each overwriting the pair of files the one before wrote -- and every step
> line appears. **That succession was what no test covered**: every existing
> test wrote ONE instruction at ONE seq. Nothing in the terminal's source
> changed. **The remaining unknown is which build is INSTALLED in the
> operator's VS Code**, which is where the next look belongs -- and
> `same-version-republish-stale-install` is the trap that fits the symptom.
>
> **`MILESTONE_PHASES` is gone.** It listed eight phases and `lineTone`
> painted every other one plain, so one session read blue, blue, plain, blue,
> plain, plain, blue, blue, plain, blue as it moved -- and `preverify`,
> `dispositions`, `fix` and `publish` were among the plain ones, which are
> exactly the phases where a session stops being routine. The assertion reads
> the phase enum out of `packages/router/schemas/driver-run.schema.json`
> rather than listing phases: **a second copy of the vocabulary is how those
> four fell out of the tone they should have had without anything failing.**
>
> **One gate row, from `renderGateRow` beside `runGates`.** `session.ts`
> wrote `- <name>  PASS` and `packaging.ts` wrote `[PASS] <name>` under a
> comment claiming they were already the same three marks. Neither spells a
> mark now. A gate that judged nothing renders as `✓ <name> (N/A)` with its
> explanation dropped -- it is the longest text on the busiest screen and it
> explains something that did not happen. **A remediation on a gate that DID
> judge is kept**: on a failure it is the operator's next action, and on a
> pass it appears only under `--force`, where dropping it would have lost the
> record of a force.
>
> **The colour goes in at the terminal, not into the log.** `forTerminal`
> paints the mark opening a line -- `✓`/`✔` bold green, `✗`/`✖` bold red,
> and a `(N/A)` row left plain -- and not one character after it. The router
> emitting ANSI would put escapes in every `close.log` on disk; the terminal
> rendering gates from a record would say them twice, once from the record
> and once from the bytes the job wrote anyway. Neither option exists for
> `node --test`, which writes its own marks and keeps no record of them, **so
> the mechanism had to exist regardless** -- and once it does the gate rows
> are one more shape it recognises. `▶`, `ℹ` and `﹣` pass through untouched.
>
> **`GATE_NOT_APPLICABLE` is now on the router's contract**, exported from
> `index.ts` rather than copied into the renderer: a gate that judged nothing
> wears the pass mark, so the terminal has to tell the two apart, and a second
> copy of that token is how they would come to disagree about one fact.
>
> **The run of record caught what the targeted checks could not.** A
> `cli.test.ts` assertion pinned the old close row -- four spaces, a dash, the
> name, `PASS|FAIL|SKIP` -- which is the format this session was asked to
> change. It exercises the close VERB rather than the gates, so no step's own
> checks reached it. It now reads the marks from `gates.ts` instead of
> spelling them, so the assertion cannot drift from the renderer again.
>
> **Next: 144, then 145.** 144 measures whether the model asked for is the
> model that answered, per transport, and is the precondition for 145's
> Configuration pane offering a list of models honestly. 145 carries 143,
> 144 and itself to the Marketplace as 2.0.23.


> ## SESSION 142 CLOSED, 2026-09-10 — the branch a host chose, now offered as a choice, and 2.0.21 tagged
>
> | session | what | state |
> | --- | --- | --- |
> | 142 | the terminal heading composed from the session number and the rule character, the count of how often that heading is drawn, `dabbler repo retrunk`, bootstrap raising the trunk as a choice, `candidateTrunk` on `resolveTrunk`, and the 2.0.21 release | CLOSED VERIFIED (round 2 of a cap of 3; round 1 found two real blocking defects, both fixed; verifier `gpt-5-6-terra`/openai, transport `api`), landed `e36204ef`, closed `52d7da80`, **releasable — `vsix-v2.0.21` PUSHED** |
>
> **2.0.21 is tagged and not yet serving.** `dabbler release --verify-install` says the
> Marketplace still serves 2.0.20, which is correct and not a fault: CI builds from the
> tag and its `marketplace` environment asks a person to approve the job before it
> publishes. **That approval is outstanding and is the operator's** — until it is given,
> anyone installing the extension gets 2.0.20. The `publication:2.0.21` decision was put
> to the operator and answered `publish`; the tag followed.
>
> **The framework stopped twice at the publish, and both stops were right.** A releasable
> session's phase advance does not tag, because a tag cannot be taken back: the first stop
> said to run `dabbler release`, which stated what would ship and raised
> `publication:2.0.21` rather than defaulting. The second stop was marked a DEADLOCK and
> was also right — the decision was answered but nothing had tagged, because answering the
> decision does not tag either; `dabbler release` run AGAIN is what tags, and the wording
> "the framework acts on it from here; you are not asked to run anything" is what sent the
> session back into the same stop. **That sentence is owed a correction**: after the answer
> the operator (or the engine) still runs `release` a second time. Nothing is broken; the
> guidance is simply wrong about who does the next thing.
>
> **The trunk a host answered for is now a choice, not a diagnosis.** 141 made the
> framework survive a placeholder default; it refused and explained and stopped there.
> `bootstrap`'s mismatch now states the situation, asks which branch is the trunk, and
> gives the exact command for each answer — and says that the two answers are not the same
> act. `dabbler repo retrunk --to <branch> --approve <who>` does the git, says every
> command as it runs it, records the approver and the branches under
> `.dabbler/runs/retrunk.jsonl`, and prints the one part no git command can do. No branch
> name is spelled anywhere in any of it.
>
> **A remote refuses to delete the branch its own HEAD names, and so does every host.**
> That is the shape of the whole trap and it is why the human instruction is load-bearing
> rather than decorative: `retrunk` pushes the work, tells the operator where to move the
> default on Azure DevOps or GitHub, and says the placeholder is still there until they do.
> Run again afterwards, it removes it. The walkthrough proves both halves over a real bare
> origin.
>
> **Round 1 found two real defects and both were mine.** (1) An unacknowledged
> `retrunk --to <target>` force-pushed a target that SHARED history, discarding commits a
> team had put there — while bootstrap's own text promised git would refuse a
> non-fast-forward. It now pushes without `--force` and lets git refuse, and the refusal
> names what forcing would cost. (2) A local branch already holding the target's name made
> the rename fail AFTER the remote had been rewritten, reporting a refusal over a change
> that stood, with no approval row. **Every refusal is now made before the first push, and
> nothing after a push refuses**: the approval is recorded for what was actually done and
> whatever could not be finished comes back as `outstanding`. That ordering rule is the
> durable lesson — a check made after the irreversible act is not a check.
>
> **The new walkthrough caught a defect 2.0.20 shipped.** `remoteBranches` filtered
> `origin/HEAD`, but `%(refname:short)` prints `refs/remotes/origin/HEAD` as **`origin`**,
> not `origin/HEAD` — git shortens a remote's HEAD to the remote's own name. Slicing
> `origin/` off `origin` left an EMPTY branch name in every candidate list, offered in
> refusals and counted when deciding whether origin has exactly one branch. It is filtered
> on the prefix now. This repository's own `for-each-ref` shows it; it was live.
>
> **Eight voice rules in one whole session, measured.** Session 141's record: four job logs
> gained bytes, each in its own lease, so the framework spoke between every pair — two
> rules per job, in fourteen minutes, plus one unnumbered opening rule. Recorded beside the
> banner in `dabblerTerminal.ts`. A session driven from a chat puts no job bytes on that
> terminal and sees none of them. **Making the rule draw more often is a change to WHEN a
> heading appears rather than to what it says**, and it was deliberately not made here.
>
> **`candidateTrunk` takes `resolveTrunk`; `localGateReceipt` keeps `headBranch`.** 141's
> nit was right about the first: HEAD on a local branch origin has never heard of sent
> `phaseGateWait` to poll a ref that would never move. The second is a deliberate
> exception and now says so in a comment — a receipt names the branch the check actually
> ran on, and resolving it elsewhere would make the receipt name a branch the test did not
> run on. The scripted `drive.test.ts` assertion that pinned the old reading is gone; the
> real one lives in `walk-git-states.test.ts` over a bare origin, because the fact under
> test is about a real remote and not about a script.
>
> **OWED to a later session.** (a) The publish guidance above — "you are not asked to run
> anything" is wrong after the answer. (b) Round 1's third nit, undisposed and deliberately
> so: the plan said the mismatch should become a `step` instruction, and it is bootstrap's
> printed instruction instead. `bootstrap` runs outside the driver loop and issues no
> instructions, and making the mismatch a driver step would put a gate in front of every
> session in every repository. That is a design question, not a defect — but it is the
> plan and the implementation disagreeing, and somebody should settle which is right.


> ## SESSION 141 CLOSED, 2026-09-09 — the trunk a host answered for, and the clone that arrived holding one file
>
> | session | what | state |
> | --- | --- | --- |
> | 141 | `resolveTrunk` as the one reading of which branch is the trunk, a checkout that refuses when it carries no record, `bootstrap` saying the mismatch at the push, and a module's checkout listing only the sessions that run in it | CLOSED VERIFIED (round 1 of a cap of 3, one non-blocking nit, verifier `gpt-5-6-terra`/openai, transport `api`), landed `8b6f738a`, closed `4b8d446a`, not releasable |
>
> **This work was written once outside a session and was rewound before 141
> ran.** It was committed to `master` on 2026-09-09 as `0ae5d4d3` with no
> declaration, no verification, no run of record and no close, and a plan
> for it was written afterwards. Both commits were force-pushed off
> `master`; the diff was preserved outside the tree at
> `D:\tmp\session-141-recovery\` and used as a REFERENCE by the session that
> then did the work under the framework. **That is the shape to repeat if it
> happens again**: the patch spares the session re-deriving what was already
> worked out, and changes nothing about the review, because the verifier
> reads the session's own diff either way. What it must never become is a
> retrospective blessing — a session whose steps produce no diff cannot be
> judged at all.
>
> **No branch name is spelled anywhere in the fix.** `main`, `master`,
> `trunk` and `develop` are one question, and `resolveTrunk` in `journal.ts`
> is the one reading of it: the branch HEAD is on **when origin has it**,
> then origin's default, then origin's only branch, then a refusal that
> names the candidates. `trunkOf` had been reading `refs/remotes/origin/HEAD`
> — the host's default, a setting nobody revisits, which on a repository
> initialised with a README on one branch and filled on another names the
> placeholder for as long as it exists. Two sites had already answered the
> question for themselves and each shipped a bug for it.
>
> **The refusal is the load-bearing change, not the ordering.** `openModule`
> returned success on a clone holding no framework record at all, so a
> placeholder default, a `--branch` typo and a cone that lost `docs/` failed
> silently and identically. It now refuses, names the branches at origin that
> DO carry the record, and says when the two share no history — the signature
> of a host-created placeholder rather than an earlier state of the work. The
> comparison is with the repository rather than a constant, so a project set
> up and never started is not refused for being early. A note would not have
> worked: `clonePathIn` reads `.path` out of `module open`'s JSON and both
> call sites discard everything else, so the notes that verb has always
> produced have never reached a human. **Only a refusal reaches the
> operator.**
>
> **The one nit, and it is owed to 142.** `localGateReceipt` and
> `candidateTrunk` take `headBranch` rather than `resolveTrunk`, so they read
> the branch HEAD is on without the clause that makes the rule safe — *when
> origin has it*. The verifier called that the original bug in miniature and
> was right for `candidateTrunk`: a local branch origin does not have sends
> `phaseGateWait` to poll a ref that will never move. **142 gives
> `candidateTrunk` `resolveTrunk` and keeps `headBranch` at
> `localGateReceipt` with the reason written down** — a receipt must name the
> branch actually tested. It is step (6) of 142's plan and has an assertion
> of its own.
>
> **The verifier saw the diff and nothing else.** `agency.mode` is `none` on
> this round: the API transport sends no tools, so the round is not
> equivalent to one that could read the tree. That is the `api_file_requests`
> default from session 135, not a fault.
>
> **142 is planned and not started**, and it is the release: the terminal's
> voice heading becomes the session number set into its rule, a
> host-created placeholder default branch becomes a choice the framework puts
> to the operator and a verb the framework executes with the approver on the
> record, the nit above, and **2.0.21** carrying 141 and 142 to the
> Marketplace. It runs on 141's `resolveTrunk` and would have to invent it
> otherwise.

> ## SESSION 140 CLOSED, 2026-09-09 — the phase an operator can read, the step they can see, and the release that went out
>
> | session | what | state |
> | --- | --- | --- |
> | 140 | the terminal's step line, the phase renamed `work`, one heading family, the packaging command that walked the whole repository, a signoff that outlived its session, and 2.0.20 shipped | CLOSED VERIFIED (round 3; round 1's blocking Major was well-founded and fixed, its two Minors disputed), landed `6ab120dd`, tagged `vsix-v2.0.20`, **published — `release --verify-install` says the Marketplace serves 2.0.20** |
>
> **The step line was never broken; no installed build had ever contained
> it.** `version.json` moved to 2.0.14 at 08:45 on 2026-09-08 and its VSIX
> was built three minutes earlier; session 126, which wrote the step line,
> committed at 14:27 the same day and did not bump. One number named two
> different extensions six hours apart, the installed one was the earlier,
> and no VSIX was built here between then and this session. **A version
> that does not move cannot signal that the build did** — the
> same-version-republish trap from the other side. D270. The
> read-once-drop-silently defect fixed alongside is real and was not the
> cause: the seq was marked as said BEFORE the instruction was read, so a
> first look that came back absent or half-written dropped the line
> permanently. It is now marked only after a read that agreed.
>
> **`steps` is `work`, and the old name is kept forever.** The enum gains
> `work`, `isWorkPhase` in `driver.ts` is the ONE place either name is
> recognised, `drive.ts` dispatches on the canonical name, and no record is
> rewritten — the retired-`ROW_WAIVE` shape. Session 140's own run says
> `now=steps` to its end, because it entered that phase before the rename;
> 141's will say `work`. Both open. `docs/terminal-walk-140.md` has that
> watched rather than argued.
>
> **A plain `vsce package` was walking the whole repository, and the
> declarations were not why.** With `dabbler-ai-router` and `yaml` moved to
> `devDependencies` it still listed **10,158** files: `.git` whole, `.venv`
> whole, and all of `.dabbler/` — where vsce's own secret scan found an
> OpenAI token in `runs/s60/driver/engine-07.log` and refused, which is the
> only thing that stopped a VSIX carrying it. The cause is the npm
> **workspace self-link**: the root `node_modules` holds a symlink back to
> the extension under its own name, and vsce follows it to the repository
> root. `../../**` in `.vscodeignore` is the fix, and both forms of the
> command now list the same 72 paths. D271. Keep the ignore line; it is not
> redundant with `node_modules/**`, which filters only the local walk.
>
> **The manifest move broke `dabbler release`, and the run of record caught
> it.** `declaredRouterDependency` read only `dependencies`, so the move
> made it read "depends on nothing" and every release would have refused as
> stale. It reads either field now. This is what the complete suite is for.
>
> **A held release burns its number.** `publication:2.0.19` was answered
> `not yet`, answered is settled, and `dabbler release` reads that standing
> answer and tags nothing — so 2.0.19 could never be consented to and this
> session spent 2.0.20. That is what version-keyed consent MEANS and it is
> strictly better than the bare id it replaced; what is worth knowing before
> the next hold is that `not yet` retires the number. D272.
>
> **The publish still needs `dabbler release` typed by hand.** The publish
> phase refused (correctly — the tag is not made by a phase advancing),
> classified the second attempt as a deadlock, and named its own exit. The
> answered decision does not cause the tag; `dabbler release` does. Session
> 139 met the same thing. **138's rewind was again never reached**, because
> every gate the publish reads passed.
>
> **A signoff about a session that has ended is asked again.** At the close,
> every open `accountability-signoff` about a session no longer running is
> superseded and re-raised with what answering NOW does — it settles the
> record and performs nothing — and what the option undertook while its
> session ran is quoted after that rather than still offered as an action.
> Round 1 was right on both halves of its Major: the first draft reached
> only the closing session, and appended the correction after the obsolete
> promise instead of leading with it.
>
> **Owed:** nothing. `repair-outside-a-step-137` is answered (`It stands`,
> session 139). One papercut recorded and not fixed: `npm install` on this
> host writes `package-lock.json` with CRLF, and `check:version` compares
> its own LF re-serialisation against the bytes — so it fails after every
> install blaming the version for a line ending. `npm run stamp:version`
> clears it.

> ## SESSION 139 CLOSED, 2026-09-09 — the release that asked, and the operator who said not yet
>
> | session | what | state |
> | --- | --- | --- |
> | 139 | 2.0.19 prepared and its publication put to the operator; held for 140 and the releasability withdrawn on the record | CLOSED VERIFIED (round 2; round 1's one blocking Major was DISPUTED and the dispute was UPHELD — the finding was withdrawn), landed `b468abda`, closed `2f36e81b` |
>
> **The version is 2.0.19 and it is NOT published.** `version.json` moved
> and the stamper wrote it into both manifests, the extension's dependency
> on the router and the lock file's workspace entries; the extension's
> `CHANGELOG.md` carries the 2.0.19 section that says what 138 changed in
> an operator's terms and names the two commands it gives them. All of that
> is landed and pushed. **No tag was made and the Marketplace still serves
> the version it served yesterday.** Session 140 is the next release and
> ships this version — or bumps past it, which is 140's call; either way
> 2.0.19's number is unspent and its notes are already written.
>
> **Session 138's four repairs were exercised rather than asserted, and
> three of them held.**
>
> - **(2) held, and this was the plan's own acceptance test.** `dabbler
>   release` refused to tag and raised a brief keyed `publication:2.0.19`,
>   not the bare `publication`. Had it tagged without asking, the plan said
>   that was a finding against 138; it asked.
> - **(4) held, and it is what let this session close.** The operator
>   answered `not yet`, which leaves a session declared releasable with no
>   packaging row — the state that used to leave `cancel` as the only exit.
>   `dabbler session withdraw-release` recorded the withdrawal with its
>   reason and approver, and `published_when_releasable` then PASSED while
>   **naming who withdrew it and why**, so the close's account of this
>   session differs from its account of one that never was releasable.
> - **(1) held as far as it was reached.** The publish refusal was quoted
>   from the packaging run's own log — the eight gate rows and the sentence
>   about `vsix-v2.0.19` not being on origin — not a string literal. One
>   refusal only, so the classifier was never asked to tell two apart.
> - **(3) was not reached.** Every gate the publish reads passed;
>   `verification_clean`, `test_run_fresh`, `working_tree_clean` and
>   `pushed_to_remote` were all PASS, so there was no earlier phase's
>   evidence to go back for. The rewind is still untested by a real run.
>
> **Round 1's Major asked for evidence the phase order makes impossible.**
> It wanted an answered publication decision, a `published` packaging row
> and a Marketplace install check — at the verification round, which runs
> before land and publish. The dispute cited the phase enum, the driver
> loop, `tagReleaseRun`'s requirement that the tag be on origin and name
> HEAD (which only the land can produce), and `published_when_releasable`,
> which is where that criterion is actually enforced. Round 2 withdrew it
> and verified. **A verifier asking a release session to prove it shipped,
> before the phase that ships, is a shape worth expecting again.**
>
> **Owed:** nothing from this session. The advisory
> `repair-outside-a-step-137` item is settled and the owed list is empty.

> ## SESSION 138 CLOSED, 2026-09-09 — the deadlocks that were not deadlocks, and the consent that was not asked for
>
> | session | what | state |
> | --- | --- | --- |
> | 138 | the stops that name their refusal, the publication decision keyed to its version, the rewind, and the withdrawal | CLOSED VERIFIED (round 2; round 1 raised one blocking Major that was RIGHT and four disputes that were UPHELD as withdrawn — see below), landed `91e5ed40`, closed `7b7801b4` |
>
> **Four defects, each one rule stated twice and drifting, each fixed by
> making the second statement read the first.** No gate was added.
>
> **(1) The publish and close stops now say WHICH refusal they met**, read
> from the job's own log tail exactly as `phaseVerify` already did. They
> threw string literals, so `previous.reason === entry.reason` reduced to
> `constant === constant`: session 137's `stop_history` is eight rows whose
> reasons are byte-identical, while its packaging record over the same eight
> attempts carries seven refusals with six distinct causes. The classifier
> was reading the first list. `judgeStopClass` and `alreadyTriaged` are now
> pure and exported, and the triage key stops being a constant as a
> consequence rather than by a separate edit — `climbLadder` was keyed on
> the same reason, so the first refusal consumed the session's one triage
> and every later one was logged `triage-skipped`.
>
> **(2) The publication decision is keyed to the version it authorises.**
> `publicationDecisionId(version)` replaces the bare id `publication`;
> `raiseDisposition` returns null for an answered id, so one answer given on
> 2026-09-02 for 2.8.0 (to npm, retired that same day) had gone on to
> authorise `vsix-v2.0.15`, `2.0.16`, `2.0.17` and `2.0.18` with nobody
> asked. **A decision keyed to nothing is consent for everything.** The next
> release raises its own brief and waits; `dabbler owed answer --id
> publication:<version>` is what settles it now.
>
> **(3) A publish refused on an earlier phase's evidence rewinds.**
> `GATE_EVIDENCE_PHASE` in `gates.ts` states once which phase makes each
> gate's evidence — `verification_clean` → verify, `test_run_fresh` →
> run-of-record, `working_tree_clean`/`pushed_to_remote` → land — and
> `phasePublish` reads the refused packaging row's own gate rows and goes
> back to the EARLIEST. Gates no phase can remake (an owed decision, a
> verdict's vocabulary, the pins, the exposure) are unmapped, and a publish
> refused on one of those still stops. Session 137 was recovered from this
> state by hand, running the five verbs the managed body says are not an
> engine's to run.
>
> **(4) Releasability can be withdrawn.** `dabbler session withdraw-release
> --reason <why> --approver <who>` writes an immutable per-session row to
> `.dabbler/runs/s<N>/releasability-withdrawals.jsonl`, in the shape of the
> reopen grant. It does NOT rewrite the declaration: the publish phase
> passes through and `published_when_releasable` PASSES while naming who
> withdrew it and why, so the close's account of a session that was supposed
> to ship and did not differs from its account of one that never was. It is
> refused after a publication, and the gate reads the packaging record
> first, so the close can never report the opposite of what shipped.
>
> **Round 1's Major was right, and my own comment was wrong.** A rewind
> throws no `Stop`, so `stop_history` gains no row and `judgeStopClass`
> never sees it — the deadlock classifier is no defence against a rewind
> that fixes nothing, which would have gone round paying for a verification
> round or a whole suite each time. The run now records its `rewinds` and
> goes back **once per distinct refusal**; a refusal already in the list
> stops instead, with that refusal in the stop where the triage ladder can
> reach it. The four disputes (that session 137's record should be a test
> fixture) were withdrawn on the evidence that `.gitignore` excludes
> `.dabbler/` whole, so those files exist on one machine and in no clone.
>
> **Also landed:** the two selection rules that were owed — `src/jobs.ts`
> selects `walk-jobs.test.ts` (owed since 136), `src/owedDecisions.ts`
> selects its own test, `release`, `gates` and `walk-record`.
>
> **Owed:** eight non-blocking NITS from round 2, the substantive one being
> that the withdrawal is asserted through `runGates` rather than by driving
> the real `session close` and reading back the row it persists — a
> walk-session case, not a unit one.

> ## SESSION 136 CLOSED, 2026-09-09 — the suite, measured and then cut
>
> | session | what | state |
> | --- | --- | --- |
> | 136 | the measurement nobody had taken, `walk-session` off the CLI child per job, and the priority courtesy moved to the job | CLOSED VERIFIED (round 2; round 1 raised one blocking Major that was RIGHT — see below), landed `1082e6e7`, closed `f0927537` |
>
> **What the measurement says, and it is not what three sessions assumed.**
> `packages/router/scripts/measure-suite-load.mjs` runs a command and every
> three seconds records CPU, physical disk queue, free memory, the process
> count and the tree beneath it **with every process's OS priority class**;
> samples land under `.dabbler/scratch/suite-load/` (untracked) and what they
> say is in `docs/design/suite-cost.md`. Through the typescript suite:
> **nothing is saturated** — 29% CPU mean, a disk queue almost always zero,
> 28 GB free — and the box is unusable anyway. The load is process creation:
> 363 distinct processes seen beneath the run (146 `git`, 124 `conhost`, 66
> node, 17 `sh` pre-commit hooks), and that is a floor, because a snapshot
> every three seconds cannot see one that started and ended between two.
>
> **The courtesy stopped at the test worker.** The `node --test` runner was
> at NORMAL in all 61 samples, and the extension suite's mocha tree is at
> normal end to end — it loads no preload. So the policy moved to where the
> driver spawns a job: `jobs.jobPriority` decides (below normal; nothing at
> all under CI, the worker preload's own rule), `jobEnv` hands it to the
> runner in `DABBLER_JOB_PRIORITY` and REMOVES the variable where the policy
> declines, and the runner applies it to itself before spawning the command,
> so the command and everything it forks inherit it. Every suite of the run
> of record is spawned beneath a job, so that is all of them. The proof is a
> spawned child's reported class from a parent stood back up at normal
> (`walk-jobs.test.ts`), and it SKIPS where the platform will not allow the
> raise rather than assert something it cannot distinguish.
>
> **`walk-session` stopped spawning a full CLI per job.**
> `jobs.setJobStarter` is the seam, in the shape of `journal.setGitSource`;
> `spawnDetachedJob` is the default and nothing in production swaps it.
> `test/support/inProcessJobs.ts` runs the verb the driver asked for through
> the CLI dispatcher — moved out of `cli/dabbler.ts` into `cli/run.ts`,
> because loading the entry RUNS the process's argv — writing the same log
> and the same status file at the same moments, so the driver still starts a
> job, issues a `wait`, polls and collects an exit code. It runs from
> `settleJobs`, which the walkthrough calls where it used to sleep, and never
> on its own: `capture` and `standIn` both refuse to nest, so a job running
> while the driver runs would interleave two verbs into one instruction.
> `walk-jobs` keeps the real spawn and says so at the top of the file.
>
> **The numbers, controlled and uninstrumented, same host minutes apart:**
> `walk-session` alone 105.9 s → 80.2 s; the whole typescript suite 215.6 s →
> 189.9 s. The session's own run of record came in at 199.7 s for 1166 tests.
> Both of today's numbers are far above session 126's 176 s on this same
> host, ten sessions and 19 tests apart; that drift is recorded in the note's
> *What is NOT explained* section rather than attributed.
>
> **Round 1's Major was right.** The first draft recorded only a sampled
> 228 s run and called it non-comparable by subtracting the sampler's 40 s —
> which is not subtractable, because the sampler runs alongside the suite and
> not in front of it. With no uninstrumented pair, the session had not shown
> the new shape was not slower, which is exactly the failure the plan asked
> to be able to see. The fix is the controlled pair above. The three NITS
> were taken too: the CI exception now removes an inherited priority
> variable rather than declining to set one, the priority test skips instead
> of passing vacuously, and the sampled process figures are described as
> observed rather than created.
>
> **Owed:** `src/jobs.ts` still maps to no selection rule in `dabbler.yaml`,
> so a change to it falls through to the smoke test; `walk-jobs.test.ts` is
> its real coverage and the rule is a one-line addition for a session that is
> already touching the selection map.

> ## SESSION 135 CLOSED, 2026-09-09 — the direct-API verifier can ask for a file, and .NET gets a root
>
> | session | what | state |
> | --- | --- | --- |
> | 135 | the `file-request` block, the one further turn behind a setting, the agency record and its two documents, and the root `.slnx` | CLOSED VERIFIED (round 2; round 1 raised one blocking Major that was RIGHT — see below), landed `098d3824`, closed `3df4ccf8` |
>
> **What landed.** (1) **A verifier on the direct-API path may ask for a
> file.** It emits a fenced `` ```file-request `` block naming
> repository-relative paths, one per line, and the framework opens the ones
> the grant allows. The block is parsed by the *same* fence walk the write
> proposals use — `labelledBlocks` was factored out of `parseProposals` so
> there is one rule about what a fenced block is — and every path is
> confined by `deliverFileRequests`, outermost boundary inward: no read
> granted, outside the repository, outside the scope, past the read budget,
> a directory, not a file here. **The budget is enforced, not counted.**
> On the seat it can only ever be measured after the fact because the CLI
> runs its own tools; here the framework is what opens the file, so nothing
> past the budget is opened at all.
>
> (2) **One further turn, on the same candidate.** `RouteOptions.followUp`
> is called once with the first answer and returns the message to send back
> or null. `routeLive` dispatches it against the candidate the escalation
> ladder already settled on — same model, provider, transport and generation
> params — and that second answer is the result; tokens and elapsed seconds
> are summed so the recorded call says what the round actually cost. It is
> straight-line code, not a loop: `followUp` never sees the second answer,
> so the ceiling of two dispatches is a property of the shape rather than of
> a counter. A failed second dispatch raises `DispatchError` and does **not**
> fall back to the first answer, which was given before the files arrived.
>
> (3) **Behind `verification.settings.api_file_requests`, which defaults
> off.** This session was therefore verified by the path it changed,
> unchanged. With it off a request block is still parsed, refused and
> recorded — a request that vanishes silently looks exactly like one that
> was never made.
>
> (4) **The root `.slnx`, the other half of D267.** `rootFilesDotnet` now
> takes the `SolutionShape` its interface always passed it and writes a
> seventh root file listing every `*.csproj`/`*.fsproj` under the modules'
> code roots. `ensureRootFilesWithSuite` writes the root files *before* it
> asks the detector, so the file it just wrote is what `detectDotnet` finds
> and the dotnet suite declares itself in the same call. `whyNoSuite` lost
> its .NET branch: it is now unreachable, and "this root holds none" would
> name a file the scaffold had just written.
>
> **Round 1's Major was right, and the fix is better than the plan's
> wording.** The finding: with the setting on, every round recorded
> `mode: tools` because the grant said so, whether or not a file was ever
> delivered — which would put a round that saw only the evidence bundle on
> the same side of the ledger as one that read source, destroying the very
> comparison the setting exists to enable. The naive fix (mode follows the
> operation count) would have destroyed the seat's own
> *granted-but-looked-at-nothing* signal. The rule that satisfies both is
> one rule, not two: **`mode` says what the round HAD IN FRONT OF IT.** The
> grant carries `toolsSent` — true only on the seat, where the tools travel
> with the request and the round had the tree whether or not it looked. On
> the API path the read is an *offer*, realised only by delivery, so `tools`
> means a file arrived. `operations_granted` is where the declined offer is
> recorded, which is what separates a setting-on round that asked for
> nothing from a repository that never turned the setting on. `AgencyGrant`
> lost its `mode` field entirely — it was written and never read, and a
> grant field the record can contradict is a trap.
>
> **Two nits from round 1 were taken too**, and one was a real correctness
> bug: `deliveredFilesMessage` trimmed trailing newlines, so a file ending
> in blank lines was collapsed. It no longer trims; a final newline is added
> only where a file has none, because a fenced block cannot express its
> absence, and the briefing, `driving-a-session.md` and the schema all say
> exactly that rather than claiming a fidelity the format does not have.
>
> **Round 2 came back VERIFIED with three nits, all on one residual
> point** — **owed**: a file with *no* final LF still arrives with one while
> its read is recorded `fidelity: "verbatim"`, which the schema defines as
> the shown lines matching the disk bytes. The prose now says so in three
> places, but the *token* still claims more than it should. The honest
> options are a fourth fidelity value for "verbatim but for a terminating
> newline the format cannot carry", or narrowing the schema's definition of
> `verbatim`. Not urgent — it can only mislead about a file's last byte, and
> only on a path that is off by default.
>
> **Tests: four, as planned, plus one the fix required.** `route.test.ts`
> drives `route` over the wire seam with a request block and asserts two
> requests, the same model on both, the file's bytes and the first answer in
> the second body, and the summed tokens. `walk-verify.test.ts` gains three
> real rounds: session 4 (setting on, out-of-scope path — refused, recorded,
> one dispatch, `mode: none`), session 5 (setting off — recorded, ignored,
> one dispatch), and session 6, added for the fix, which drives `runRound`
> over `setHttpSource` with the setting read from the config on disk and
> asserts two dispatches, the untrimmed contents in the second, and
> `mode: tools` with a `verbatim` read. `ecosystem.test.ts`'s existing .NET
> assertion was inverted: it now asserts the `.slnx`, its projects, its SDK
> floor and the declared suite. Run of record green on both suites — 232 s
> TypeScript, 11 s extension.
>
> **Three notes for whoever is next.** The `.slnx` is named
> `<directory>.slnx` **verbatim**, not through the parent POM's
> lowercase-hyphen sanitiser: `dotnet new sln` keeps the directory's case,
> and Maven's artifactId convention is not .NET's. A **fifth** copy of
> session 134's false *"the verifier runs its own tests inside the round"*
> sentence was found and fixed in `docs/driving-a-session.md` — 134 fixed
> four and this was the fifth; grep before assuming there are no more. And
> **`docs/schema-reference.md` had never documented the `agency` block at
> all**; it does now, every field.
>
> **After it lands, the measurement is the point.** Run sessions with
> `api_file_requests: true` and compare the blocking-finding rate against
> the seat's measured 1.30 a session and the blind API path's 0.53. Turning
> it on by default is a separate decision that the measurement settles, not
> this session.

> ## SESSION 136 INSERTED, 2026-09-09 — the suite the operator cannot work through
>
> **The operator was crippled through 135's run of record**, and said so while
> it ran. The release session was renumbered 136 → 137 and a new 136 put ahead
> of it, because a fourth attempt at this belongs before a release rather than
> inside one.
>
> **What was looked at while 135 closed, and what it does and does not say.**
> Sampling started after the run of record had finished — 135 was already at
> `phase: close` — so **none of these numbers describe the burst**: CPU 31%,
> disk 97% idle, Defender 0%, 29.8 GB free of 63.8 GB, `node --test
> --test-concurrency=4` and its walk children winding down. The one useful
> negative is that nothing was still saturated a minute after the suite ended,
> so whatever the operator felt is inside the run and not a leak that outlives
> it.
>
> **The fact nobody has recorded is the priority class of the process tree.**
> `no-git.ts` calls `setPriority` in each test *worker* and a Windows child
> inherits its parent's class, so a walkthrough's CLI children are covered —
> but the runner process, the driver's `job-runner.cjs`, `dabbler.cjs`, and
> the extension suite's mocha, which loads no preload at all, are all outside
> that call. Sessions 122 and 126 both restored a protection without ever
> measuring whether it reached the tree. **Step one of 136 is that
> measurement**, and the entry says the finding is worth recording even if the
> theory turns out to be wrong.
>
> **What is already known and needs no measuring** (`docs/design/suite-cost.md`):
> the eight walkthroughs hold ~416 s of the ~176 s run, `walk-session.test.ts`
> alone about 118 s — the floor no worker count goes below — and the other 330
> test files together cost about 30 s. The load is process creation, not
> arithmetic. Session 96 cut 40 s to 17 s with a seam rather than a throttle,
> and that is the lever step two takes.

> ## FOR SESSION 137, step 3 — why the operator never saw `S133:`
>
> Reported after installing the latest VSIX: no `S133:` appeared on any
> *Dabbler* terminal voice rule. **The code is there and the bundle carries
> it** (`voice()` in `router/dabblerTerminal.ts` returns
> `` `S${this.bannered}: framework` ``, and the built `dist/extension.js`
> contains it). What is missing is an occasion to draw it.
>
> `emit` draws a rule **only when the speaker changes**, and the rule
> carries the name of the voice that follows. Two consequences:
>
> - `sayBanner` deliberately does **not** draw a rule — "a voice rule
>   directly beneath a banner would be two headings for one group" — but it
>   *does* set `speaker` to the numbered voice. So after the banner the
>   framework's voice is already current, and no rule is drawn for it.
> - A numbered framework rule is therefore drawn **only after a job has
>   spoken** and the framework speaks again. A session with no job output
>   on that terminal — which is what a chat-driven session looks like — has
>   no change of voice at all, and the only rule on the scrollback is the
>   plain `framework` one drawn before the session was known.
>
> **This is session 137's step 3, and it is bigger than a label.** Putting
> the operator's `133 – framework` form on the rule and a session number on
> a job's rule does not help if no rule is drawn. Step 3 should decide
> whether the session's first framework rule is drawn *after* the banner
> (numbered, one heading for the group) or whether the banner itself is
> the numbered heading — and say which, because today it is neither.

> ## SESSION 134 CLOSED, 2026-09-09 — what the verifier is told, and what it can see
>
> | session | what | state |
> | --- | --- | --- |
> | 134 | the four false sentences, the prompt's test-assessment section, and the adaptive diff-context ladder | CLOSED VERIFIED (round 1, no blocking findings, two nits), landed `eda641ee`, closed `8e197897` |
>
> **What landed.** (1) **Four sentences that stopped being true in session
> 100** now say what actually runs. `testphase.ts` went with the six-step
> workflow and no verifier has written or run a test since, but the managed
> body's *What comes back*, the scaffolded `dabbler.yaml`'s testing header
> (both template strings in `bootstrap/templates.ts`), `drive.ts`'s
> `phasePreverify` comment and — **the fourth site, not in the plan's list of
> three** — the refusal `dabbler test-evidence --stage preverify-targeted`
> prints from `cli/testEvidence.ts` all claimed one did. All four now carry
> the same clause: *the tests that run are each step's own checks and the
> complete suite as the run of record, and the verifier reviews without
> writing or running one.* The fourth was corrected because it is the one of
> the four an **operator** reads rather than a maintainer; fixing three and
> leaving that one is the worse outcome. `AGENTS.md` was regenerated with
> `bootstrap --no-transport-detect`.
>
> (2) **The verifier is asked about the tests, and proposes without writing.**
> A new section in `prompt-templates/verification.md`, between *Your
> Instructions* and *Materiality*, asks it to assess the tests in the diff —
> is each claimed behaviour actually *pinned*, or would the test still pass
> with the behaviour reversed — and to name a missing case as
> **precondition / input / expectation** rather than as "needs more coverage".
> Two boundaries stated in the section: scope is **only the tests in the
> diff**, because on the API transport nothing else is visible; destination is
> **NITS**, non-blocking, never another round. The line is drawn explicitly:
> a test *this session's own task promised and did not deliver* stays an
> **Issue** under Completeness, so an assessment cannot be laundered into a
> blocker.
>
> (3) **The verifier sees the code around the change.** `DIFF_CONTEXT_LADDER`
> is `[24, 12, 6, 3]`, widest first, with git's own default as the floor.
> `renderWidestThatFits` returns the first render at or under
> `evidenceCharCap()`; the floor's render is handed to `checkEvidenceCap`
> unchanged, so **a session too large for three lines of context still raises
> `EvidenceTooLargeError` with the same message and the same escape hatch** —
> the ladder removes a failure mode and adds none. `assembleEvidence` and
> `assembleFixDeltaEvidence` both go through the one ladder so they cannot
> drift; per-width diffs are memoised, and emptiness is judged once on the
> floor diff, because a diff that is empty is empty at every rung. Length is
> measured in code points, as the cap measures it.
>
> **The one test** is a milestone in `walk-record.test.ts` (real git lives
> only in `walk-*`): a 400-line tracked file with one line changed renders a
> 49-line hunk at 24 context; with the cap set one character below that
> render, the bundle comes back **under the cap** with a 25-line hunk instead
> of an exception; with the cap at 200 it still raises. Run of record green
> on both suites — 1161 TS tests, 0 failures.
>
> **The new prompt section worked on its first live round.** Round 1 came
> back VERIFIED with two nits, and the second nit is exactly the shape the
> section asks for: a concrete proposed case for `assembleFixDeltaEvidence`
> stated as two tree IDs, a cap one character below the 24-context render,
> and the 12-context hunk it should return. **Worth taking in a later
> session** — the fix-delta path goes through the same ladder and is proven
> only by construction, not by a test.
>
> **Nit 1 was wrong, and harmlessly so.** It said `CLAUDE.md` and `GEMINI.md`
> were not regenerated because only `AGENTS.md` appears in the diff. Bootstrap
> *did* rewrite all three; the other two carry the `@AGENTS.md` import line and
> their engine tail and **not the body**, so regenerating them changes nothing.
> The blind API verifier could not see that from the diff alone. Nothing to do.
>
> **A trap for the next session that runs bootstrap here.** `bootstrap`
> scaffolds an untracked `docs/modules.yaml` on every run in this repository —
> it has never been tracked, and 133 sessions have run without one. It was
> removed rather than adopted: introducing it would change how sessions are
> scoped, which is nobody's side effect to make from a documentation step.
>
> **Three more were planned after this close, at the operator's ask.** The
> .NET root solution file — the other half of D267, session 131's owed item,
> homeless once 133 took the last of D258–D267 — **is session 135's fourth
> step**, deliberately not the release session's: 136 carries the release, and
> a scaffold's behaviour change does not ride with it. It shares nothing with
> 135's verifier work and says so in the entry. **Session 137** — the release
> session, renumbered from 136 when the suite session was inserted ahead of it
> — takes the terminal heading and the extension's label: the session number
> on every *Dabbler* terminal voice rule in the operator's own form (`134 –
> framework`, and a job's rule headed at all, which it is not today), and the
> activity-bar container and settings section renamed to *Dabbler AI
> Orchestration*, which the extension's `displayName` has said all along.
> **The heading is not a label change**, per the note below: no rule is drawn
> at all in a chat-driven session, so the step decides the occasion before it
> decides the text, and carries a third test for the session that puts no job
> output on the terminal. 135 went to four tests and 137 has three; both
> entries say which.

> ## SESSION 133 CLOSED, 2026-09-08 — the four papercuts, and the walk's record closed
>
> | session | what | state |
> | --- | --- | --- |
> | 133 | D263, D264, D265 and D266, and `uat-walk-findings.md` closed against all ten | CLOSED VERIFIED (rounds 1 and 2, no findings in either), landed `29d6a174`, closed `80cb0298` |
>
> **What landed.** (1) **Dabbler: Troubleshoot** has a seventh item that runs
> the toolchain both walkthroughs open with — git, node, dotnet, java, mvn,
> copilot — and reports what answered. `prerequisiteReport(probe, env)` is
> exported and pure: the probing is a `ToolProbe` seam, so the report is a
> function of what was found rather than of whatever the suite's host has
> installed. `DABBLER_TRANSPORT` is printed **by value**, because which one is
> set is the question; the three API keys are printed **present or absent and
> never by value**, because this channel is one an operator pastes into an
> issue, and the test asserts exactly that. (2) `bootstrap --project-dir`
> names the target's own `.dabbler`: an optional `projectDir` threads through
> `freshnessWarnings` → `checkFreshness` → `resolveRecordPath`, and
> `absentRecordNotices` now loads the config for the project it was told to
> act on. (3) New Module's first box is titled `1/4`. (4) `spawnSyncProgram`
> in `checks.ts` is the synchronous twin of `spawnProgram`, and
> `runPackDefault` and `timedSpawn` use it — measured on this host, `mvn
> --version` through it exits 0 with an empty stderr where `shell: true`
> printed DEP0190. (5) The walk's owed table gains an *answered* column for
> all ten; the findings themselves are not revised, because the walk is
> evidence and evidence is not edited to agree with the code.
>
> **The one file outside the plan.** `ROUTER_VERSION` is exported from
> `packages/router/src/index.ts`. The prerequisite report has to name the
> router the extension is *running*, and `dabbler version` on a terminal's
> PATH answers a different question — the extension bundles the router, so a
> PATH lookup can report the wrong program or none.
>
> **The run of record failed once, and the cause was the operator's own
> machine.** Three tests in `config.test.ts` asserted a *layer's*
> `transport.profile` by reading it through `resolveTransport`, which answers
> the whole precedence chain — flag, then `DABBLER_TRANSPORT`, then the
> layer. The operator's HKCU now persists `DABBLER_TRANSPORT=api`, so the
> complete suite failed on the one host that runs it while every targeted
> check stayed green; the run of record inherits the shell by design, which is
> why a suite may not read one. One `withoutTransportEnv()` helper isolates
> the four describes that touch it, proven green with the variable set to
> `api`, set to `copilot-cli`, and unset. **Both rounds ran on `--transport
> api`** with `gpt-5-6-terra` as verifier.
>
> **Still owed:** the .NET root solution file, the other half of D267 and
> session 131's owed item — without it a scaffolded .NET solution declares a
> suite whose `dotnet test` has no root to resolve (MSB1003). Sessions 134,
> 135 and 136 are planned and unchanged; 136 carries the release.

> ## SESSION 132 CLOSED, 2026-09-08 — the rest of the first-run path
>
> | session | what | state |
> | --- | --- | --- |
> | 132 | D259, D261 and D262: the manifest committed, the ledger out of the dirty count, the remote asked for at set-up | CLOSED VERIFIED (round 2; round 1's one blocking finding was WRONG and was disputed — see below), landed `ff9c8f9f`, closed `63911a52` |
>
> **What landed.** (1) `bootstrap` adopts an untracked `docs/modules.yaml`
> into its own commit — the one file it commits without having written it,
> because it writes that file itself whenever it is absent, and the only way
> it is missing is that the operator declared their modules first, which is
> the order both walkthroughs teach. A *tracked* manifest with edits is left
> alone: that is somebody's work. The count in the printed line still counts
> only what bootstrap wrote; the adopted file is named beside it. (2) The
> focused checkout's dirty refusal is now `materialPaths`, so it counts the
> operator's work and not the framework's record — the second press of Start
> Focused Session used to refuse over `docs/sessions/sessions.json`, which is
> the one file a person is told never to touch. (3) `dabbler bootstrap
> --remote <url>` records `origin` and pushes the branch with an upstream,
> and Set Up New Project asks for it once, skippably, through the
> `SetUpProjectUi` seam.
>
> **Where `materialPaths` lives now, and why it moved.** It is in
> `checks.ts`, with `parsePorcelain`, `unquotePorcelainPath`,
> `isSetBookkeeping` and `WorktreeGateOptions`. `checkout.ts` importing
> `gates.ts` closes the knot `checkout → gates → exposure → checkout`, which
> the boundary control refuses, and a second copy of the rule inside the
> checkout is the one thing that would make the two disagree. `checks.ts` is
> the only module both sides already import that is legal in both
> directions — it holds `isFrameworkInstalledPath` and `selectTests` beside
> it, which are the same kind of judgement about a changed path. The close's
> own judges (`judgeWorktree`, `materialWorktreeChanges`, `readWorktreeFacts`,
> `hookRemovedFor`, `readWorktreeStatus`) stayed in `gates.ts`. The
> `dabbler.yaml` selection rule for `checks.ts` gained the two walkthroughs
> that now prove it.
>
> **The round-1 finding was false, and disputing it was right.** It claimed
> the new `--remote` walkthrough calls `bootstrapVerb` on a folder that is
> not a repository, so the test could never reach what it asserts. Bootstrap
> initialises one itself (`cli/bootstrap.ts:219-234`), and the file's own
> first test has relied on that since it was written. The dispute cited both,
> plus the bare repository the new test creates being the push TARGET beside
> the project rather than the project's own repository. Round 2 withdrew it
> and returned VERIFIED with no findings. **Both rounds ran on `--transport
> api`, not the Copilot seat**, which session 131 used: `local-overrides.yaml`
> asks for `api` and a persisted `DABBLER_TRANSPORT=copilot-cli` outranks it,
> so the flag is how the operator's own documented choice is honoured.
>
> **Still owed from session 130's walk:** D263–D266 are session 133 (the four
> papercuts, and `docs/uat/uat-walk-findings.md` closed against each of the
> ten). The .NET root solution file — the other half of D267, session 131's
> owed item — is still unwritten.

> ## SESSION 131 CLOSED, 2026-09-08 — the three that stop a first-time operator
>
> | session | what | state |
> | --- | --- | --- |
> | 131 | D258, D260 and D267: the button-made module, the .NET ignore rule, the suite declared at the first pack | CLOSED VERIFIED (round 2 settled `cap-clean`; round 1's one blocking finding was right), landed `fd072a68`, closed `da5c1ee7` |
>
> **What landed.** `create` defaults the two values the four-box New Module
> flow never asks for — `modules/<slug>` as the code root, and the slug as the
> package in the casing a sibling's package already uses (a groupId reused for
> Maven, a namespace and PascalCase for .NET, the slug verbatim when no
> sibling declares one); the defaulting is in the one writer behind both the
> button and the command line, and an explicit value still wins. `rootFilesDotnet`
> appends `bin/` and `obj/` through the same `ensureIgnoreRules` the Maven
> side uses. And the scaffold declares the ecosystem's suite at the moment the
> ecosystem becomes known, through the writer bootstrap itself uses.
>
> **Two structural rulings this session made, both from a control that
> refused.** The suite declaration does **not** live in
> `ecosystem.ensureRootFiles`, where the plan put it: that import closed the
> cycle `ecosystem → bootstrap → transports → agency → ecosystem` and the lint
> control refused it. It lives in `bootstrap/detect.ensureRootFilesWithSuite`,
> which may depend on the ecosystem seam because the dependency runs one way,
> and the three `module`/`modules` call sites call that. Baselining the six
> edges was the other option and was not taken.
>
> **Owed, and measured rather than guessed: a .NET solution has no root for
> `dotnet test` to resolve.** `dotnet test` reads the project or solution in
> the directory it runs in, and a multi-module .NET solution keeps its
> projects under `modules/` and writes nothing at the root — verified here,
> `MSB1003: Specify a project or solution file`. So the .NET half of D267 is
> only half closed: the scaffold now refuses to declare a suite it could not
> run and says why in a note, where Maven declares one because the parent POM
> the same call writes is what `mvn -q test` reads. **The remaining half is a
> root solution file** — the .NET counterpart of that parent POM, which
> `rootFilesDotnet` does not write. A `.slnx` listing each module's projects
> was proven to work here (SDK 11 preview; `.slnx` needs 9.0.200+). It is one
> more root file and belongs to whichever session takes the rest of D258–D267.

> ## SESSION 130 CLOSED, 2026-09-08 — the UAT that tests the UI, walked; ten product defects owed
>
> | session | what | state |
> | --- | --- | --- |
> | 130 | the UI path walked in two ecosystems, both UAT walkthroughs rewritten in three registers, one new document check | CLOSED VERIFIED (round 2, `gpt-5.4/openai`; round 1 found one blocking defect and was right), landed `272f28d9`, closed `74e3ea50` |
>
> **The walk is the finding.** Two scratch solutions outside the tree —
> `C:\temp\uat130-dotnet` and `C:\temp\uat130-java`, both still on disk —
> were built by following the walkthroughs with the router verbs each button
> generates, reading the command implementations for their exact prompts.
> **Nineteen findings: ten product defects and nine document errors.** The
> record is `docs/uat/uat-walk-findings.md`; every product defect is owed as
> a decision, **D258–D267**, with its reproduction and its bucket. What was
> *not* walked is stated there too: neither walk ran an AI session's own work,
> because the path under test is the operator's.
>
> **The three that stop a first-time operator.** (1) A module made with **New
> Module** can neither pack nor host a session — the two of six values it does
> not ask for are exactly the two that matter, and an absent `codeRoots` reads
> as the repository root (D258). (2) **Nothing ignores .NET build output**, and
> the Maven side already carries the fix with the reason in its own comment;
> four consecutive .NET packs gave four versions where three Maven packs gave
> one, and the same omission refuses the next `session start` and the close's
> pull-forward (D260). (3) **Neither walkthrough ever declares a test suite**,
> and `dabbler affected` prints the `configured-rule` pass one line above *"no
> suite is declared, so there is no command to run"* (D267).
>
> **An audit claim falsified.** `docs/design/command-ownership.md` ruled the
> walkthroughs' commit after bootstrap dead text, on the grounds that it finds
> nothing to stage. It does not: the modules are declared first, so
> `docs/modules.yaml` is untracked at that point and bootstrap does not commit
> it (D259). Deleting the commit as ruled would have left the tree dirty for
> the declaration. What was dead was the *explanation* beside it, and that is
> what moved into the first register.
>
> **The documents are instruments now.** Both walkthroughs are eleven steps in
> UI-first order, each carrying **Framework / You / Underneath** — or naming
> the register it lacks and whose gap that is. `packages/router/scripts/check-uat-registers.mjs`
> holds them to it: three registers or an answered absence with a bucket,
> every command title against the extension's `contributes.commands`, and no
> manual commit inside the bootstrap step. Eight self-test cases; all three
> rules fired on the documents as they stood.
>
> **Also fixed:** two stale `.dabbler/runs/<set>/s<N>/` paths in
> `docs/quick-start.md`. The csv walkthrough needed no change. The same stale
> segment survives in `packages/router/src/approvedPlan.ts`'s opening comment
> and is left for a session that is changing that file.
>
> **Next.** The plan declares no more sessions — `close` said so. The ten owed
> decisions are the work in front of the next plan, and D258, D260 and D267
> are the three that a first-time operator hits.

> ## SESSION 127 CLOSED, 2026-09-08 — focused or global, the plan says which; one click starts it; the framework pulls
>
> | session | what | state |
> | --- | --- | --- |
> | 127 | focused or global from the plan, the module folder kept, the one-click start, the Solution Explorer's mark, suites owned by roots, the overlay and the decision function gone, five papercuts | CLOSED VERIFIED (round 2, gpt-5-6-terra over `--transport api`; round 1 found three blocking defects, all fixed), landed 8a3e1210, closed 8b91efb6 |
>
> **The kind, from the plan.** `extractSessionKindsFromPlan` reads the first
> `Module: <slug>` or `Scope: whole repository` line under each session's
> heading; every projection row carries `kind` and `module` (from the row's
> checkout where it has one, else the plan), the repository carries
> `checkoutModule`, and the Work Explorer's yet-to-run rows say `focused:
> persister` or `global`. `judgeSessionKind` in `session.ts` decides a start:
> focused when the solution is multi and the plan names one module, global
> otherwise; `--focused` / `--global` override it (on `start` and `drive`);
> `--module` must agree with the plan, and against an explicit `Scope: whole
> repository` it needs `--focused` beside it (round 1's finding); a start in
> another module's folder, or a global start in any module's folder, is
> refused by name and the extension withholds Start Session there. A global
> session in a multi-module solution writes no exposure manifest and no
> policy, its declaration names any declared modules or none
> (`judgeModulesForShape` has a global case), and the exposure gate skips
> saying so. **The walkthrough now starts session 1 from the plan alone.**
>
> **The folder kept.** `EXISTING_CLONE = "reset"`: a clean clone is fetched
> and reset, a dirty one refused naming its paths, and nothing is ever
> deleted (a window holds it). The clone's marker records the repository it
> was opened from; `close` in a clone pulls that repository forward after
> its push (`pullRepositoryForward`: clean tree pulls `--ff-only`, otherwise
> one line naming `git -C <repository> pull --ff-only`), and a fresh
> registration pulls its own checkout first when it has an upstream and a
> clean tree. `docs/design/module-checkout-preflight.md`'s decision section
> now says why the folder is kept.
>
> **One click.** In the repository's window, Start Session (and Start
> Unattended Session) with a focused next session, or **Start Focused
> Session** on the one module row the plan names (`;next-session`), pick the
> engine and model, run `module open` in-process, write
> `.dabbler/start-request.json` in the clone and open its window; a window
> activating on a request under ten minutes old runs the start with those
> choices, so the AI's terminal opens with the sentence typed. In the module's
> own folder the same button opens the AI there. **Resume Session** on the
> in-flight row shows the engine's terminal by name or opens `Session NNN`
> running `dabbler session run`.
>
> **The mark.** `project()` adds `inSession` per module (the in-progress row's
> checkout, else its declared modules, else the module-session marker in the
> repository); `start` and `close` rewrite the projection; the module row
> leads with `● session N` in the milestone blue with `;active`; the
> repository window's Work Explorer row says `focused session NNN running in
> <folder>` from the marker; the Solution Explorer watches `sessions.json`
> and the marker.
>
> **Suites and folders.** A suite with no `module:` whose covers and test
> roots all lie under one module's roots or shared files is that module's.
> In a focused folder a reached suite of another module whose test roots hold
> no test file is skipped (`run-of-record-skipped reason=tests-not-on-disk`),
> recorded as an advisory `run-of-record-owed/s<N>/<suite>` decision carrying
> `module`, and the freshness gate does not demand it while the decision is
> open **or answered with the owed choice** (round 1's finding: accepting the
> recommendation used to hand the deadlock back).
>
> **Gone.** The debug grant and its overlay (`layDebugGrants`, `writeOverlay`,
> `OVERLAY_TARGETS`, the targets import line, `--debug`, the pack callbacks,
> Widen for Debugging); the policy's decision half (`protected`, `writable`,
> `destructive`, `decide`, `SELF_GRANT_VERB`); `judgeExposure`'s sibling-bytes
> refusal, now `siblingBytes` lines on the close manifest said beside the
> gate. The grant brief ends with the permanent form (add the sibling's root
> to `sharedFiles`), and `checkoutCone` keeps a directory-shaped shared entry
> whole. The managed body's Hard rules gained the bullet: siblings are here as
> packages and contract folders; ask with `--request-grant`; `session cancel
> --force` is a person's verb.
>
> **Papercuts.** `repairedPaths` filters rebaseline's list; an engine's
> `cancel --force` (told by `DABBLER_DRIVEN` or `CLAUDECODE` in the
> environment, `callerIsEngine`) is **refused** with the person's way named
> (round 1's finding: recording it as a decision still cancelled); `start`
> records `hookRemoved` on the row's orchestrator block and the before-work
> exemption for `.claude/settings.json` holds only then; the terminal's
> step-line dedup resets per session; bootstrap's removal has its test.
>
> **Numbers.** Run of record: typescript 1148 pass, 4 skipped, 179 s at
> `--test-concurrency=4`; extension 221 pass. Verification: two rounds, about
> twelve minutes end to end. The router dist and the extension bundle are
> rebuilt from the landed tree; the installed VSIX is still 2.0.14 without
> these changes, no version bump until the block ships.
>
> **Traps met.** The suite runs under Claude Code with `CLAUDECODE` set, so a
> test of an engine-only refusal must pin the environment (the CLI cancel
> test does). A `python - || node -e` chain in Git Bash hands stdin to a
> Python REPL shim and runs nothing: edit files with the editing tools.
>
> **Owed.** Nothing from round 2 (no findings). Still standing from earlier:
> the operator's UAT walk is session 130 (the UAT that tests the UI), which
> now walks Start Focused Session, Resume Session and the kept folder.
> **Next to start: 130.**

> ## SESSION 126 CLOSED, 2026-09-08 — it just works: the repaint reproduced then fixed, the terminal that tells you, the cap back at no cost, and no hooks
>
> | session | what | state |
> | --- | --- | --- |
> | 126 | the basics the operator saw go wrong during 125 | CLOSED VERIFIED (round 1, gpt-5-6-terra over `--transport api`, three nits, none blocking), landed d1a2188b, closed 0bd7b78a |
>
> **The repaint, reproduced before it was fixed.** Two harnesses in the
> scratch directory, neither in the tree, against a disposable bootstrapped
> repository driven with the real router through a plan step, its report
> and three work steps. The first stood where `extension.ts` stands (the
> extension's `ProjectionCache` over the in-process router, the real key, a
> raw watcher on the same file names): seven scans, every soft refresh
> agreed with a fresh projection — the plan's suspect, a cached failed
> projection, was not the cause. The second was VS Code itself through the
> Layer 3 launch, sampling every row twice a second: `start` repainted in
> 60 ms, every `next` within 520 ms, and **the plan report not at all** for
> the 10.3 s until the following `next`. A plan report writes
> `driver/plan.json` and nothing else; the file was in the cache key but not
> in any watcher pattern, so the Work row's steps waited for the next record
> write or the 30 s poll — and a person who refreshes by hand inside that
> window sees the refresh as what fixed it. The pattern is now
> `*/driver/{run.json,plan.json}`; the Layer 3 spec that proves the run.json
> transition proves the plan.json one beside it (it failed its five-second
> window against the old bundle and passed in 1.3 s with the new); a failed
> projection is no longer cached, because its reason died when the router
> went in-process, and a unit test holds that. The whole record is the
> section "Session 126: the repaint, reproduced" in
> `docs/design/option-a-poc.md`.
>
> **The terminal.** `poll()` reads the ledger's in-progress row and says the
> `SESSION 126` banner the moment the row appears, before any run record,
> with the kind line under it — `focused module=persister scope=…` from the
> row's checkout and `policy.json`, or `global scope=the whole repository`
> — and in the repository's own window during a focused session one line
> from the module-session marker. The voice rule reads `S126: framework`
> while a session is known, and every history line keeps the voice it was
> said in so a replay draws the right rule. When `run.seq` moves it reads
> `driver/instruction.json` and says `step <id>` with the first sentence of
> the ask, or `rejected <id>` with the first reason, once per seq. No
> extension change was needed: the terminal already polls every 500 ms.
>
> **The cap, measured.** `--test-concurrency=4` is back on the typescript
> suite (D246). Measured once by hand as `dabbler.yaml` runs it: 176 s for
> 1147 tests — the same wall clock as uncapped the session before, because
> the floor is the slowest walkthrough. The run of record then took 187 s.
> The yaml comment and `docs/design/suite-cost.md` say the seam and the cap
> are different protections; the control check still reads its sentence.
>
> **No hooks.** `installStopGate` is `removeStopGate`, run at both places
> the install ran (`session start` for a claude-code registration, and
> `bootstrap` under Claude Code); it removes only the framework's own
> `hook-stop` entries and drops an emptied `Stop` and `hooks`. `hookStop`,
> `stopGateDecision`, the `hook-stop` verb and the `stop-gate-continued`
> event are gone; this repository's `.claude/settings.json` is `{}`; the
> before-work exemption for that file covers it untracked or modified. What
> tells a person nothing is answering an instruction is the terminal's
> silence watcher and the Work Explorer's attention row, and both documents
> say so. **A Claude Code chat opened before this landed still runs the old
> hook until its window reloads.**
>
> **Owed from round 1 (three nits, none blocking), for 127:** the before-work
> exemption now covers any `.claude/settings.json` change, so an operator's
> own pre-declaration edit to it would pass as non-work (the verifier
> suggests recording that the registration removed the hook and exempting
> only then); the terminal's step-line deduplication is keyed by `seq` alone
> and should reset when the session changes; the bootstrap path of the
> removal has no test of its own (the `start` path has one).
>
> **Driving notes.** `--transport api` on the first `next`; a foreground
> bounded loop (`drive-waits.mjs` in the scratchpad: watch the job's status
> file, call `next` when it ends or the retry is due, stop at the first
> non-wait) carried verification, both runs of record, the land, the push
> and the close. One report was refused because its `--notes` text began
> with `--test-concurrency`, which the parser read as a flag: never start a
> notes value with a dash. The router dist is rebuilt from the landed tree;
> the extension bundle under `tools/…/dist` is rebuilt too but the installed
> VSIX is still 2.0.14 without these changes — no version bump until the
> block ships. **Next to start: 127.**

> ## SESSION 125 CLOSED, 2026-09-08 — the policy, written once; and round 12 changes what follows it
>
> | session | what | state |
> | --- | --- | --- |
> | 125 | the policy — what a module session may touch, written once | CLOSED VERIFIED (round 2, gpt-5-6-terra, two nits, none blocking), landed 96a36399, closed 0a0a6f42 |
>
> **What 125 built.** `packages/router/src/policy.ts`: the `ModulePolicy`
> record — `allowed` (moduleScope's list with the module's shared files),
> `protected` (the ledger pair under the sessions directory, `docs/modules.yaml`,
> and `.dabbler` whole), `writable` (`.dabbler/scratch`, carved out of both
> because the plan instruction itself tells the engine to write its answer
> there), `siblings` (slug, roots, contract folder) and `destructive` (six
> regular expressions) — written to `.dabbler/runs/s<N>/policy.json` by
> `declare` when the declaration names modules and by `start --module`,
> and never for a one-module shape. `decide(policy, call)` answers
> protected-path, write-outside-scope, destructive-command and the soft
> sibling-read that names the contract folder and `dabbler session
> self-grant-read`; anything it cannot read is allowed and marked
> `unobserved`, and it fails open on any throw. `scope` joined the
> instruction schema (type regenerated) and rides on the first plan step
> and its rejections with one sentence in the ask; `dabbler session scope`
> prints the same list; `policy` sits in `workflow-startup` in
> `boundaries.json` with its own selection rule. Three tests; the suite is
> 1147 tests, 1143 passing, typescript 176 s, extension 10 s.
>
> **Measured, for whoever writes a shell reader.** The destructive patterns
> were run through TypeScript, GNU `grep -Ei` and PowerShell `-match` over
> 39 commands and agree only once a blank is spelt `[ ]`: a POSIX bracket
> expression reads `\t` as a backslash and a `t`, so `[ \t]` matched
> `.\bin` in grep and nowhere else.
>
> **The run of record failed once, on the suite's own rule.** `policy.test.ts`
> reached `loadConfig`, which asks git for the project root, and the
> `no-git` preload refuses that outside a walkthrough. Fixed in the driver's
> `fix-run-of-record` step by answering `rev-parse --show-toplevel` through
> the support table. Round 2 then verified with two nits: the
> `.dabbler/scratch` carve-out reads as contradicting the plan's "everything
> under `.dabbler/`" (decided: it stays, the answer must be writable, and it
> is in the file so a shell reader sees the same exception); and `writable`
> arrived without a schema bump (no policy was ever written by the earlier
> shape, so there is nothing to migrate).
>
> **What the operator saw while it ran, and what that changed.** The Dabbler
> terminal printed the banner and two phase lines through three steps; the
> Work Explorer had to be refreshed by hand; the suite took the machine.
> A parallel session ran design round 12 the same morning
> (`docs/design/consults/round12-{brief,sol,gemini,synthesis}.md`); the
> operator then discussed it and **decided, that afternoon** (the note atop
> `round12-synthesis.md`; the plan's preamble to 126): the wall exists to
> keep a session's work and tokens on its own module, it need not be
> foolproof, stability and developer experience come first, and the
> experience to match is a repository per module. So **the module folder
> that sessions 100–120 built stays** and is simplified, and nothing is
> built inside a tool call. Every session is **focused** (the module's own
> folder and window, kept between sessions and refreshed from the server)
> or **global** (the repository itself, no wall); the plan says which under
> each session's heading (`Module: persister` / `Scope: whole repository`);
> *start the next session* takes the default, *… focused session* and
> *… global session* choose; the framework pulls the repository forward
> at a focused session's close and at any start; the existing grant is the
> override and one line in `sharedFiles` makes it permanent; **no hooks —
> the Stop hook goes.** **126** is the basics: the Work Explorer repaint
> reproduced then fixed, the terminal's banner at registration with the kind
> and scope, the session number on its rules, a line per step,
> `--test-concurrency=4` back and measured, the Stop hook removed at both
> places it was installed. **127** is the kind from the plan and the flags,
> the folder kept (`EXISTING_CLONE` = reset), the pull at close and start,
> the one-click start from a module row through a start request the new
> window consumes, the Solution Explorer marking the modules in play, and
> the trims: `decide`, the destructive list, `writable`, the self-grant
> wording, the `--debug` overlay and Widen for Debugging go; the record,
> `scope` on the instruction and `session scope` stay; the sibling-bytes
> clause becomes a line, the changed-path clause stays the gate. **128 and
> 129 are cancelled** into 127; 130 runs after 127. **The proof ran the same
> afternoon** — a two-module .NET solution under `C:\temp\optiona-poc`, two
> hand-written sessions through today's buttons, recorded in
> `docs/design/option-a-poc.md`: both closed VERIFIED in one round, about
> four and a half minutes each; the first attempt deadlocked because the run
> of record ran app's suite in model's folder (a suite without `module:` is
> repository-wide, a `shared-types` change reaches consumers whole); Start
> Session pressed in the wrong window registered session 2 in model's
> folder and the AI cancelled it with `--force` and drove session 2 from
> there; the AI's editor tab could not be found. Six findings are on 127's
> list in the plan. **Next to start: 126.**
>
> **Driving notes.** `--transport api` on the first `next`; a foreground
> bounded loop (next → sleep `retry_after_seconds` → next, budgeted under
> the tool's ten minutes) carried verification, the run of record and the
> close. The router dist is rebuilt from the landed tree so the next session
> drives with 125's router; no version bump — 2.0.14 stays until the block
> ships.

> ## SESSIONS 121–123 CLOSED, 2026-09-08 — two ways in, the suite that took the machine, and who owns a command; version 2.0.14
>
> | session | what | state |
> | --- | --- | --- |
> | 121 | two ways in — the seat and the keys (both UAT documents get a Prerequisites section in three parts) | CLOSED VERIFIED, landed e5d304bf |
> | 122 | the suite that takes the machine | CLOSED VERIFIED, landed a8d5a37b; D257 recorded after the close, da59b0b9 |
> | 123 | the principle, and the three commands the UI does not have (re-scoped) | CLOSED VERIFIED (round 1, gpt-5-6-terra, three nits), landed 0a02e76f |
>
> **122 — two protections had lapsed.** Session 76's below-normal worker
> priority died with `vitest.config.ts` and nothing replaced it; the
> walkthrough exemption in `no-git.ts` admitted files by the `walk-*` filename
> pattern. Both are back — the priority in the `--import` preload, the
> exemption as an explicit list — and both are audited by a new lint control,
> `packages/router/scripts/check-suite-cost.ts`, not by tests: **D257**, which
> the verifier disputed and which was upheld (the suite runs under the preload
> and cannot observe its own baseline). `docs/design/suite-cost.md` carries the
> measurement and says plainly that the jump from 40 s to 102 s between
> sessions 98 and 99 is not explained; the control fails if a later session
> quietly invents a cause.
>
> **123 — the principle, recorded and applied.** `docs/design/command-ownership.md`
> states the operator's rule (constant or parameterised → the framework when
> lifecycle-timed, the UI when optional, a person only for judgement) and
> audits every command the two UAT walkthroughs ask a person to type, each
> checked against the extension's manifest and implementations. Most were
> already buttons; the manual commit after `bootstrap` is dead text
> (`commitOwnScaffold`); three commands failed the principle, and rounds 10
> and 11 changed two of their fates — Start Session's `--module` goes to
> **128** beside the clone's deletion, the pull-back is **eliminated** with
> the clone, and the pack a person could not ask for from a row is **built**:
> `pack` joined the router's in-process module verbs, and **Pack Module** sits
> on the module row of a multi-module solution, running `dabbler module pack
> <slug>` and showing the router's lines or its refusal. Four findings the plan
> did not list are recorded for 124's walk: New Module asks for four values
> and a module needs six (no code root, no package); nothing in the UI asks
> for the remote the land pushes to; a hand-written plan must be committed by
> hand before session 1; Troubleshoot runs none of the prerequisite checks.
>
> **Owed from 123's round 1 (three nits, none blocking).** `packModule` relies
> on the menu gate (`;focused`) and does not itself check the projection's
> `multi`, unlike `openModule`; the new test proves the handler and not the
> menu contribution; and the audit's prerequisites row read as a conflict
> (fixed after the close, in the same commit as this handoff). The first two
> go into session 128, which touches the module row anyway.
>
> **Queued papercut (operator, 2026-09-08).** The Dabbler terminal's voice rule
> should carry the session number: `────── S123: framework ──────` rather than
> `──── framework ────`. `dabblerTerminal.ts` draws the rule and already
> knows the run's session (`sayBanner`); it is a small change and belongs in
> the next session's plan as a step of its own.
>
> **Version 2.0.14** is stamped, both artefacts rebuilt, the VSIX at
> `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-2.0.14.vsix` and
> installed on this machine. Publishing it is the operator's call, as always.
>
> ### HANDOFF — what runs next, and how
>
> **Sessions 125–129 are planned and in the ledger**: the wall between an
> engine and a sibling's source moves from the disk to one fail-open hook in
> front of the CLI's own tools (`docs/design/consults/round11-synthesis.md`;
> the plan sections under "Session 125 of 129" onward). 125 the policy, 126
> the hooks installed by bootstrap, 127 reads watched and the self-grant, 128
> the close that never refuses for coverage plus the clone deleted and Start
> Session's module pick, 129 Claude Code through its own hooks.
>
> **Session 124 (the UAT in three registers) is cancelled and re-planned as
> session 130**, done 2026-09-08 by the operator: it walks buttons 125–129
> change, and the ledger registers sessions in numeric order
> (`judgeStartBoundary` in `packages/router/src/session.ts` refuses a start
> that is not the next sequential session and skips only *cancelled* numbers,
> so a restore after 129 would have been refused as well). The plan's 124
> section says where it went; the 130 section carries the same text plus the
> four findings of 123's audit the walk must settle. **Next to start is 125**;
> the ledger grows to 130 at that start.
>
> **Driving a session from chat.** `session start --engine claude-code
> --provider anthropic`, then `next` in a foreground bounded loop; pass
> `--transport api` on the first `next` because this machine's
> `DABBLER_TRANSPORT` is `copilot-cli` and the seat catalog has no 5.6
> models. Session 123 verified at round 1 on gpt-5-6-terra over the API.

> ## SESSIONS 118–120 CLOSED, 2026-09-07 — the three owed things, and what step 10 found
>
> The three items STATUS left owed are done: the owed-answer deadlock, the
> Java walkthrough's step 10 (never walked before), and the version stamp.
> Walking step 10 found the two deepest defects in the modules feature so
> far — both of them in the path the whole design exists for.
>
> | session | what | state |
> | --- | --- | --- |
> | 118 | what the framework writes before a session declares | CLOSED VERIFIED, landed 390fdcba |
> | 119 | the sibling a Maven module cannot consume | CLOSED VERIFIED, landed 3a59fb1a |
> | 120 | what a focused checkout unavoidably holds | CLOSED VERIFIED (round 3), landed c7b00a19 |
>
> **118 — one rule, in one place.** `undeclaredSessionInFlight` and
> `commitBeforeDeclaring` live in `writers.ts` beside what a declaration is;
> bootstrap reads them instead of its own copy, and `dabbler owed answer`
> reads them after an answer that wrote `dabbler.yaml` — which is the case
> the walk hit, because `session start` raises the suite decision and its
> recommended answer writes a tracked file inside the window where the
> declaration refuses a dirty tree.
>
> **119 — consuming a sibling as a package had never worked on Maven.** The
> `store` module declared it the way the design says to (a versionless
> `<dependency>` taking the parent's managed pin) and Maven refused: *"Could
> not find artifact com.example:solution-parent:pom:0.1.0-dev... in modules
> (file:///.../packages)"*. `module pack` deploys the module's jar and POM
> and never the root parent POM, which the deployed POM still names (flatten
> in `resolveCiFriendliesOnly` resolves `${revision}` and keeps the parent).
> The seam gained `feedRootArgv` — what the FEED needs besides a module's own
> artifacts — which is one non-recursive parent deploy for Maven and nothing
> for .NET, where a `.nupkg` names no parent.
>
> **120 — the exposure gate refused the checkout the design requires.** The
> `app` session ran in its focused clone, as a module session is meant to,
> and the close refused for 1603 bytes of `model` and 1223 of `store` — all
> of it their `pom.xml` files, which git's cone mode materialises beside the
> contract folders the cone asks for, plus a `.flattened-pom.xml` the reactor
> wrote. `siblingBytes` now measures SOURCE: not the contract folder, not the
> ecosystem's build files, not what the repository ignores.
>
> **The walkthrough was wrong twice, and is corrected.** A module session
> starts as `session start --module <slug>`, which makes the clone and
> registers the session inside it; a session started in the full checkout
> cannot close once a sibling has source, and no grant can rescue it, because
> a grant widens a focused clone and the full checkout is not one. Step 8 now
> checks the checkout the session is already in.
>
> **Step 10, walked end to end on the fixed build.** Session 2 (`store`)
> consumed `json-model` as a package; session 3 (`app`) ran in
> `C:\temp\uat-java3.app`, where neither sibling's source exists, consumed
> both as packages, verified at round 1, ran the maven suite as its run of
> record, landed from the clone and closed with all nine gates green. The
> full checkout pulled the work, and the built loader printed exactly what
> the document promises:
>
> ```
> read 3, stored 3
> read 3, stored 0
> ```
>
> **Version 2.0.13** is stamped and both artefacts rebuilt; the VSIX sits at
> `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-2.0.13.vsix`.
> Publishing it is the operator's call, as always.
>
> **Owed.** One thing, and it is small: the walk's session 2 was cancelled
> rather than closed (it had run in the full checkout, where no module
> session can close), so the `store` module's work is landed but was never
> carried by a session that closed. Nothing depends on it; a reader of that
> ledger should know why the row says cancelled.

> ## SESSIONS 113–117 CLOSED, 2026-09-07 — the queued work, and what the Java walk found
>
> Three things were queued and none started: the `deployables:` block the
> design specified, the Java run with its UAT script, and two Maven defects
> found while dogfooding it. All three are done, and the walk that was the
> third item turned into six more product defects and three documentation
> errors — every one of them found by following the walkthrough as written,
> and none of them findable by a test in this repository, because no test
> runs `mvn`.
>
> | session | what | state |
> | --- | --- | --- |
> | 113 | the two Maven papercuts (one of them blocking) | CLOSED VERIFIED, landed 3c11838d |
> | 114 | the `deployables:` block, built | CLOSED VERIFIED (round 2), landed 103a1ed9 |
> | 115 | what the walk found: a Maven session that can close | CLOSED VERIFIED, landed 2c2e2ecd |
> | 116 | what the walk found: the first ten minutes | CLOSED VERIFIED, landed c04df4a8 |
> | 117 | the ignore rule that never fired | CLOSED VERIFIED (round 2), landed 0d7620f9 |
>
> **113 — the pin file, and the JDK.** `module pack` printed `pinned <id> in
> Directory.Packages.props` on a Maven solution, where the pin really moves
> the root `pom.xml`; the same literal seeded the candidate record, so the
> file that moved was unaccounted for and the land's verification gate would
> have refused it. `PackResult` now carries the seam's `pinFile`. The
> scaffolded root POM hardcoded `maven.compiler.release 21`; it now asks the
> JDK that is scaffolding (`java -version`, through a settable source) and
> falls back to a stated 17.
>
> **114 — `deployables:`.** The manifest reads a top-level `deployables:`
> list (slug, title, kind, from, runtime, publish), refusing an unknown key,
> a duplicate slug, a `from` naming an undeclared module and a `from` naming
> a non-application. Which deployables a module feeds is derived, never
> declared. A manifest with no block implies one deployable per application
> module, so a solution that ships what it already ships declares nothing
> new. `bundleRecord` is keyed by the deployable, unions its `from` modules'
> dependencies (safe because a package has one central pin), refuses two
> `from` modules at different versions by name, and the record carries
> `from`. `modules show`, `affected`, the projection and the Explorer's
> bundle row all say what ships.
>
> **The walk, 2026-09-07, `C:\temp\uat-java`.** One AI session on the model
> module, verified at round 2 by gpt-5-6-terra, landed — and then could not
> close. `mvn deploy` writes a POM and a `.md5`/`.sha1` beside every
> artifact; `packModule` recorded only the artifact it went looking for, so
> `verification_clean` saw a tree that moved and `exposure_within_ceiling`
> saw nine paths outside the session's scope. Two more measured on the way:
> the module session's `impact.json` was `"suites": []`, so the run of record
> ran **nothing** and `test_run_fresh` still passed; and a pack of an
> unchanged module minted a new version every time, because `mvn` writes
> `target/` inside the module's own code roots.
>
> **115 and 117 fixed those.** The candidate is now what the pack LEFT (the
> feed snapshotted before and after), a module session's scope carries
> `packages/`, `.dabbler/` is never counted as a change outside it, a
> declared suite that names no module is repository-wide and reached by any
> change, and the Maven scaffold ENSURES its two ignore rules rather than
> writing a file — 117 exists because 115's write-once version never fired:
> `dabbler bootstrap` writes `.gitignore` first, which is 116's own
> correction to the walkthrough.
>
> **116 — the first ten minutes.** The plan instruction listed the members a
> work plan carries and never mentioned `modules`, which the declaration is
> refused without in a multi-module solution: an engine answering what it was
> asked for was refused every time, and the second identical refusal is a
> deadlock. Bootstrap told a session that had not declared yet that "its land
> is what commits them", when the declaration refuses a tree carrying
> changes. The recommended answer to the `testing-suites` decision refused in
> a repository with no `dabbler.yaml` (and named two wrong causes), then
> appended a **second, identical** suite once one existed. Both UAT documents
> now run `dabbler bootstrap` before the first session; the .NET one stops
> telling the reader to hand-write `sessions.json`; the Java one leaves
> `Item.java` to the session whose plan says to write it, which is what cost
> the walk a blocking Major and a dispute.
>
> **Proven on the fixed build, `C:\temp\uat-java3`.** The same tree packs to
> the same version twice (`0.1.0-dev.20260907.1.ga6aac5f`, both times);
> `updated .gitignore` appends the two Maven rules under bootstrap's own; the
> plan instruction says "Declared here: model, store, app"; the suite answer
> declares `maven` once and does not duplicate it; `impact-plan
> modules=["model"] suites=["maven"]`; the maven suite ran as the run of
> record; and the close passed **all nine gates**, `verification_clean` and
> `exposure_within_ceiling` among them.
>
> **Owed, and not done here.** (1) The same deadlock 116 fixed for bootstrap
> also exists for the owed answer: `dabbler owed answer --choice declare`
> writes `dabbler.yaml`, and a session that has not declared is then refused
> until the operator commits it. The fix is the same shape — say who commits
> it, before the declaration. (2) Step 10 of the Java walkthrough — the
> `store` and `app` modules, a module consuming a sibling as a package, and
> running the loader — has still never been walked; the walk of 2026-09-07
> proved one module end to end. (3) The router and extension are still
> stamped 2.0.12: sessions 113–117 are landed but not versioned or rebuilt
> into the VSIX.

> ## THE MODULES BLOCK, RUNNING UNATTENDED FROM 2026-09-06 — where it stands
>
> The operator asked for the nine sessions of the block to be planned and
> run back to back, unattended, with Sol consulted where input was needed.
> The plan is `docs/sessions/session-plan.md` ("Why sessions 100–108
> exist"), reviewed by Sol before it was committed
> (`docs/design/consults/round9-brief.md`, `round9-sol.md`). The handoff
> below is the one this run started from and is kept as written; each
> session that closes adds its own block under it, newest first.
>
> | session | what | state |
> | --- | --- | --- |
> | 100 | solution plan and module manifest; the six-step workflow deleted | CLOSED VERIFIED, landed 19d621c5 |
> | 101 | module configuration, the exception schema, the test-impact vocabulary | CLOSED VERIFIED, landed 33557781 |
> | 102 | designed contracts and contract-test source; the ecosystem seam | CLOSED VERIFIED, landed 594bca00 |
> | 103 | committed immutable packages | CLOSED VERIFIED, landed 6e2b9b73 |
> | 104 | the focused checkout and the Windows preflight | CLOSED VERIFIED, landed 706eb2af |
> | 105 | module-scoped sessions, the hard verifier scope, exposure, grants | CLOSED VERIFIED, landed 8ef7dd8d |
> | 106 | the impact plan and the selected run of record | CLOSED VERIFIED, landed 2873f493 |
> | 107 | the atomic land | CLOSED VERIFIED, landed 5c456da8 |
> | 108 | Maven parity and the hardened profiles | CLOSED VERIFIED, landed 6d06461a |
>
> One operating failure on the record: session 101's second round finished at 17:18 and the loop idled until 20:06, because the background waiter's completion never woke the orchestrator. The rule since: every framework wait is driven from a foreground loop that polls the job's status file, and the run state is checked at the start of every turn.
>
> Paused after session 103 on the operator's instruction (2026-09-06, 21:15) and resumed in a new chat at 21:27 with session 104; the router and extension on this machine are rebuilt after each close. Every framework wait is driven from a foreground loop (the scratchpad's drive-waits.sh pattern), never from a background waiter. A session driven from the chat with the CLI shows nothing in the Dabbler Terminal, which is expected: that terminal renders a run the extension launched.
>
> **The block completed on 2026-09-07 at 01:55.** Nine sessions, every one closed VERIFIED by a cross-provider round (gpt-5.4 over the Copilot seat), none skipped, none forced; the round cap was raised on the record twice (102, 106). Two things the operator decides next, neither started here: whether the ground rules set aside for the rebuild (`AGENTS.md`, superseded 2026-08-23) come back into force now that the replacement works; and whether the Maven side gets the walk the .NET side had, since no test runs `mvn` and no Maven repository was driven end to end (the .NET POC under `C:\temp\modules-poc` was; a Maven twin of it is the honest next check). Owed from the block, on the record: the Windows clone preflight numbers are a floor (Defender real-time was off on this machine); a re-measurement with it on is owed before a customer reads them.

> ## SESSION 108 CLOSED, 2026-09-07, VERIFIED (round 3, gpt-5.4 over the seat; rounds 1 and 2 each found one Major in the Java surface reader, fixed; landed 6d06461a) -- Maven parity, and the hardened profiles
>
> Two steps, nothing asked of a single-module solution. **The Maven side of
> the ecosystem seam** (`ecosystem.ts`), which had refused by name since
> session 102, is filled the way a Maven team already works: the root files
> are a parent `pom.xml` (the modules it aggregates, the CI-friendly
> `${revision}`, a `<repository>` of `file:///${maven.multiModuleProjectDirectory}/packages`,
> the deploy and flatten plugins managed) plus the packages folder's
> attributes and README; a module is built from its own POM (`mvn -f
> modules/<slug>/pom.xml`, the parent reached by `relativePath`), which is
> what a focused clone can do without the siblings the parent lists; the
> pack default is one reactor `deploy` per module into the file repository
> under the dev version (`-Drevision`, `-DaltDeploymentRepository`, tests
> skipped), the artifact looked for at its repository-layout path; the pin
> is one managed `<dependency>` in the parent's `<dependencyManagement>`,
> replaced in place, and a consumer's `<dependency>` carries no version;
> the contract scaffold is an `<artifact>-api` module and an
> `<artifact>-contract-tests` module with an abstract JUnit 5 class, wired
> into the module's aggregator and its implementation, and a
> `<provider>-compatibility` module against a provider's artifact; the
> surface reader reads public declarations with their Javadoc from the api
> module (interface members at the interface's own depth, `default` and
> `static` ones included, `private` ones not); the focused checkout's
> convenience file is `.mvn/maven.config` naming the module's POM; and the
> grant has no overlay -- Maven loads no external profile -- so a granted
> sibling with `--debug` is rebuilt from its source into the file
> repository by `module pack`, handed in by the two callers that settle a
> grant. **Everything .NET-specific that was still outside the seam moved
> behind it**: the base version, the packaged artifact's path, the LFS
> pattern, the central pins and their writer, a consumer's references and
> the debugging overlay are seam methods, and `packages.ts`, `land.ts`,
> `gates.ts`, `exposure.ts` and the candidate job know no ecosystem. A
> Maven package id is `groupId:artifactId`; a record or page name writes
> the colon as `+`, which no NuGet id carries, so the name decodes one
> way. **The hardened profiles, designed and not built**
> (`docs/design/hardened-profiles.md`): what a customer who needs sibling
> source hidden from a machine rather than from a model is asking for, the
> two profiles (encrypted custody under an external key with authenticated
> encryption, never a one-time pad; a container per session), what each
> costs an ordinary .NET team, the trigger (a named customer with the
> requirement in writing), and the seams by path; its check
> (`packages/router/scripts/doc-paths.mjs`) is that every path it names
> exists, and 17 do. Three router tests over seeded trees and a scripted
> pack; no test runs `mvn`.
>
> The two Majors were the Java surface reader's: round 1 found it dropped
> an interface's `default` and `static` members, round 2 that the fix read
> a multi-line method's body lines as members; both readers (C# too) now
> read members only at the interface's own brace depth. The block's test
> budget (48 router, 12 extension) closes with 26 router and 5 extension
> tests added across the nine sessions.

> ## SESSION 107 CLOSED, 2026-09-07, VERIFIED (round 2, gpt-5.4 over the seat; round 1 found one Major and two minors, all fixed; landed 5c456da8) -- the atomic land
>
> Three steps, nothing asked of a single-module solution. **The land judges
> from facts** (`land.ts`, new): `judgeLandReadiness` refuses when the tree
> about to be committed is not the tree the last green run of record ran
> against, naming the paths that moved; when a changed module's
> correspondence record (source digest, contract digest) no longer matches
> the tree; or when any suite the impact plan reached is stale or red or
> has no run -- `phaseLand` reads the facts from the record and stops with
> the refusal, and the gate receipt maps the landed commit to each
> correspondence record this session made. **Two gates join the close**:
> `pins_current` (every consumer's pin of a changed module is the one
> central `PackageVersion` naming the candidate this session packed, and no
> consuming `PackageReference` carries a `Version` or `VersionOverride` of
> its own, read as attributes or as child elements) and
> `exposure_within_ceiling` (the closing manifest shows zero sibling
> implementation bytes outside a recorded grant and no file changed
> outside the session's scope); both are single-module no-ops that say so
> in the close log. **The bundle record**: the candidate job writes
> `release/<slug>/bundle.yaml` for every application module, packaged or
> not -- the application's version, each transitive dependency's package
> id, version and digest as pinned, the session, the date and `baseCommit`
> (the `HEAD` it was built on; the landed commit does not exist until the
> land, so the gate receipt carries it under `bundles`, as it carries the
> packages under `correspondence`) -- refusing while any pin is a `-dev`
> version; bundling is recorded, never executed. A releasable session on a
> module publishes through its own `modules.<slug>.packaging`
> (`moduleOfSession`). The Solution Explorer gains a bundles node and each
> module's *shipped in*, derived from the records. Four router tests, one
> extension test.
>
> Round 1's Major was that the record named the pre-land `HEAD` as the
> commit that ships; the fix is the `baseCommit` field and the receipt's
> mapping above. Round 2's one minor (a reader that only knows the new
> field name) needs nothing: no record was ever written under the old
> name outside a test. One driving slip: `session report --step` requires
> `--notes`, and a report refused for it leaves the previous report file
> in place, which the next `next` then judges as a stale answer -- a
> harmless rejection that only bumps the sequence.

> ## SESSION 106 CLOSED, 2026-09-07, VERIFIED (round 4, gpt-5.4 over the seat; round 1 found two Majors and a minor, fixed; the cap raised from 3 to 5 for this run on the record; landed 2873f493) -- the impact plan and the selected run of record
>
> Three steps, nothing asked of a single-module solution. **One impact
> plan** (`impact.ts`, new): `planImpact` derives from the manifest, the
> suites and the changed paths the modules reached (roots and shared files),
> each one's own suites (`module-changed`), each transitive consumer's
> consumer-contract suite against a changed module (`consumer-contract`),
> every suite of every transitive consumer of a changed shared-types module
> (`shared-types`; the sharper reason wins), the candidates (changed modules
> with a package) and the unowned paths; single-module: every required
> suite. The selector's module form takes its whole-suite offers from it and
> `dabbler affected` prints candidates and unowned paths, so nothing computes
> it twice. **Candidate bytes before the run of record**: `dabbler module
> candidate --session N <slug>...` packs each module and regenerates its
> contract page, recording what it wrote with a sha256 per path
> (`candidate.json`); in a module session `phaseRunOfRecord` plans from the
> material worktree changes, writes `impact.json`, runs the candidate job
> first and only the plan's suites, whole, as final-full; the plan and the
> candidate stand once written after the latest round (a re-entry reads them
> back, since the candidate moves the shared files a recomputed plan would
> reach, and a re-pack would move the tree under a green run); the close
> gate demands the plan's suites and no other, and `verification_clean` sets
> a candidate path aside only while its bytes are the candidate's. **The
> Explorer**: the module row reads *run of record: green | red | none* from
> the latest final-full records of its suites, a consumer whose contract
> suite against a producer is red reads *blocking* under used-by, and Show
> Impact plans a hypothetical change under the module's roots (`dabbler
> affected --path`) and shows the plan. Four router tests (two of them
> `walk-impact` milestones over scripted suites and a scripted pack, driving
> a module session end to end) and two extension tests.
>
> **What the walkthrough found in the framework, all fixed in the diff.**
> The worktree snapshot (`journal.snapshotWorktreeTree`) failed in a sparse
> clone: an index read from HEAD carries no skip-worktree bits, so `add -A`
> staged every sibling's file as deleted (or refused the engine's settings
> outside the cone); it now copies the bits entry by entry from `git
> ls-files -v` and adds with `--sparse` (never by copying the index file,
> which a concurrent rewrite tears -- the run of record found that too). The
> land adds with `--sparse` for the same reason. A `start --module` no longer
> asks the suites question of a clone it does not stand in. And **session
> 104's flake is diagnosed and fixed**: the close took the lifecycle lock in
> a single attempt while the driver's polling saves hold it for a moment, so
> a close landing in that moment refused at once and paused the session; the
> close now waits like every other lifecycle verb, and both walkthroughs put
> their jobs' logs in the assertion when `next` prints no instruction.
> **Round 1** found the plan recomputed over the candidate's own writes and
> the exemption covering an edited candidate path; both are what "stands
> once written after the latest round" and "as written, by digest" answer.
> Two run-of-record failures under the full suite's load, each a framework
> fix, spent rounds 3 and 4; the cap was raised to 5 with the reason on
> `amendments.jsonl`. Router suite 1,112 tests (1,108 passing, 4 skipped),
> extension 201.

> ## SESSION 105 CLOSED, 2026-09-06, VERIFIED (round 2, gpt-5.4 over the seat; round 1 found one Major, fixed; landed 8ef7dd8d) -- module-scoped sessions, the disk as the wall, the exposure manifest, grants
>
> Five steps, nothing asked of a single-module solution. **The module form
> of the verifier's scope** (`moduleScope` in `agency.ts`): the module's
> `codeRoots`, its own and its transitive dependencies' `contract/` folders,
> the root build files and the solution file present at the root, its
> `sharedFiles` and the sessions directory -- never a sibling's source; the
> round takes it when the shape is multi and the session's row names a
> module, and `sessionScope` as today otherwise. **The plan's step 3 was
> amended on the record**: neither transport executes the verifier's reads
> (the Copilot CLI runs its own tools and reports them afterwards; the API
> transport sends none), so no executor of the framework's can answer a read
> with a refusal. The focused clone can: a sibling's implementation is
> absent from it, and an out-of-scope read that found no file is recorded
> `refused` (the wall holding) apart from a delivered out-of-scope read (the
> wall leaking); `rounds.jsonl` and the projection carry `refused_reads`,
> and the briefing tells the verifier a refusal is not a finding. **The
> exposure manifest** (`exposure.ts`, new): `.dabbler/runs/s<N>/exposure.json`
> with, per sibling, the implementation bytes under its roots in the working
> directory (contract folder and build output excluded; target zero), the
> grants in force with their reasons from `grants.jsonl`, and the paths
> changed outside the scope; written at `session start --module` and at the
> close, projected as `repository.exposure` so `dabbler status` prints it.
> **`session start --module <slug>`** in the full checkout refuses material
> changes or unpushed commits, makes the fresh clone (which carries
> `.dabbler/checkout.json` so a start inside it registers there), registers
> the session in the clone's own sessions root with `checkout: {module,
> path}` on its row, writes the manifest, and leaves
> `.dabbler/module-session.json` in the full checkout so `next` there is
> refused naming the clone until the clone's session closes. **Grants**:
> `dabbler module grant <sibling> --reason ... [--debug]` raises
> `module-grant:<sibling>` (value-tradeoff, `deny` recommended); `dabbler
> owed answer` acts on the answer -- `sparse-checkout add` over the
> sibling's roots, the untracked `.dabbler/overlay.targets` regenerated from
> the grants in force (a `PackageReference Remove` and a `ProjectReference`
> per packable project), the manifest refreshed -- and says the window
> reloads; `revoke` refuses while the sibling's roots hold changes, then
> drops the overlay block and re-narrows to the derived cone plus the other
> grants; `next --request-grant <sibling> --reason ...` raises the decision
> and answers a `wait` on it, applying an answered grant before advancing.
> **The Explorers**: the Work Explorer groups a bucket's sessions under
> module rows when the record names one (single-module untouched) and a
> grant request renders on the session that asked, with grant and deny as
> the answer flow's options (the projected decision carries
> `sessionNumber`); the Solution Explorer's module row reads *widened* while
> a grant is in force and offers Widen for Debugging and End Grant. Eight
> router tests (four of them walkthrough milestones over the local bare
> origin), two extension tests.
>
> **Round 1's Major**: a session started in one module's clone could be
> declared over two modules, and the scope, the manifest and the grouping
> would have followed the declaration rather than the checkout. Fixed by
> making the checkout the authority: the driver judges the plan against the
> row's `checkout.module` (a plan naming no module, another or a second is
> refused; a two-module session runs in the full checkout without
> `--module`), and the round's scope and the close-time manifest read
> `checkout.module` first. Router suite 1,108 tests (1,104 passing, 4
> skipped), extension 199.

> ## SESSION 104 CLOSED, 2026-09-06, VERIFIED (rounds 1 and 2, gpt-5.4 over the seat, no findings in either; landed 706eb2af) -- the focused checkout and the Windows preflight
>
> Three steps, nothing asked of a single-module solution. **The cone is
> derived** (`checkout.ts`, a new module): `checkoutCone(shape, slug,
> sharedFiles)` names the module's `codeRoots`, `packages/`, `docs/`, the
> `modules/<x>/contract/` folder of every transitive dependency and every
> transitive consumer, and the folder of each shared file, as cone-mode
> directories; the root build files are not listed because cone mode
> delivers every root-level file with any cone, which is also what lets the
> convenience file and the engine's settings sit at the clone's root without
> widening it. `modules.checkout.parent` is read by `checkoutParent`.
> **`dabbler module open <slug>`** refuses a single-module solution (open
> the repository itself), makes the origin a `file://` URL when it is a
> path (git ignores `--filter` on a local-path clone), clones
> `--filter=blob:none --no-checkout --sparse` under the parent (default
> `<repo>.<slug>` beside the repository), narrows with `sparse-checkout set
> --cone`, checks out the trunk (origin's HEAD) or `--branch` (created from
> the trunk when origin has none), writes the seam's convenience file --
> `<slug>.slnf` filtering the root's one solution file, `<slug>.slnx`
> listing the module's projects otherwise; both shapes built with the real
> SDK -- and `.claude/settings.local.json` with
> `permissions.blockReadsOutsideWorkingDirectories` (the project-local file:
> this repository tracks `.claude/settings.json`), excludes both in the
> clone's `.git/info/exclude`, and reports whether the clone is really
> filtered (`rev-list --missing=print`). `--reset` fetches, resets hard,
> re-narrows and keeps ignored build output. The Router contract gains
> `module.open`; the extension gains **Open Module** on a module row of a
> multi-module solution (`;focused` on the row's contextValue), a new window
> at the router's answered path. **The preflight** (`dabbler module
> preflight <slug>`) measured on the POC copy with a filter-capable bare
> origin: fresh clone 1.4 s, cold restore/build/test 8.3 s; `--reset` 1.5 s,
> warm toolchain 3.7 s; five sequential clones 1.3-1.6 s; Defender's
> real-time protection was OFF on this machine, recorded as a floor.
> Decision: **a fresh clone per session** (`EXISTING_CLONE = "fresh"`; a
> clone holding changes is refused; `--reset` stays the persistent path),
> because the saving is seconds against a session of minutes and only a
> fresh clone restores the wall (a grant's fetched blobs stay in a reset
> clone's object store). `docs/design/module-checkout-preflight.md`. Three
> router tests (the walkthrough `walk-checkout.test.ts` over a local bare
> origin with `uploadpack.allowFilter`), one extension test.
>
> **Two things the run itself found.** The run of record failed once on
> `walk-session`'s "every phase once" milestone -- `next` printed no
> instruction under the twenty-worker load and the walk hid its stderr;
> green on re-run, so the walk now puts `next`'s exit code and stderr in
> the assertion's message. Judging that fix then crashed the driver: the
> .NET compiler server the preflight's build started outlived the check and
> held the check's scratch TEMP, and `checks.execute`'s cleanup threw EPERM
> out of `next`. Every .NET toolchain spawn now runs with node reuse and the
> build server off (`DOTNET_TOOLCHAIN_ENV`, `-p:UseSharedCompilation=false`
> on build, test and pack) and the executor leaves a held scratch directory
> to the OS with a note. Two traps for the record: a file under `.dabbler/`
> is ignored and so is not a tree change, and a report naming one is
> refused; `dotnet build-server shutdown` does not stop an MSBuild
> node-reuse worker, only `Stop-Process` does. Router suite 1,101 tests
> (1,097 passing, 4 skipped), extension 197.

> ## SESSION 103 CLOSED, 2026-09-06, VERIFIED (round 3, gpt-5.4 over the seat, one dispute withdrawn; landed 6e2b9b73) -- committed immutable packages
>
> Four steps, .NET first through the ecosystem seam, nothing asked of a
> single-module solution. **The root build files appear with the second
> module** (`ensureRootFiles`, called by `modules create` after the write
> and by `module contract` and `module pack` before their work), each
> written only where absent: `nuget.config` with the `packages` source by
> relative path, `Directory.Packages.props` with central management on,
> `Directory.Build.props` with Source Link off under `DABBLER_DRIVEN`,
> `Directory.Build.targets` importing the untracked `.dabbler/overlay.targets`
> when it exists (a *targets* file: props load before a project's items),
> `packages/.gitattributes` with the LFS line commented for the ceiling to
> turn on, and `packages/README.md`; a solution whose modules are still
> empty folders is told the files wait for the first project file. **The
> dev version** (`packages.ts`) is `<base>-dev.<yyyymmdd>.<n>.g<digest7>`:
> the same tree answers with its own version, a moved tree takes the next
> number for the day and sorts after by NuGet's numeric ordering; the
> **correspondence record** `packages/<Package>.<version>.json` carries the
> source digest, the contract digest, the session and the *base* commit;
> **the pin** is the one unconditioned `PackageVersion` in
> `Directory.Packages.props`, replaced in place, added under the `Modules`
> group, a conditioned or duplicated entry refused by name. **`dabbler
> module pack <slug>`** refuses a single-module solution, a module without
> a package and a module whose source is not on this disk (naming the
> grant); digests the roots and the contract folder; runs the module's
> declared pack once with `{output}` and `{version}` (a declared pack that
> cannot take `{version}` is refused by name, never passed over) or the
> ecosystem's default per packable project (`dotnet pack ... -o packages
> -p:PackageVersion=<v>`; test projects, compatibility suites and
> `IsPackable=false` projects excluded); refuses a target that left no
> package; pins each id and records each. **The ceiling**
> (`modules.packages.ceilingBytes`, default 5 MiB) refuses a package over it
> unless the feed is under LFS, names both ways out, and leaves no pin, no
> record and no artifact. Six router tests over a scripted `dotnet`.
>
> **The real toolchain was the pack step's own check** (`.dabbler/scratch/
> check-module-pack.mjs`): a copy of the POC repository, `module pack
> model` with the router run from source, the pin moved, `dotnet restore`
> and `dotnet build` of the persister's tests against the package just
> committed, then `module pack persister` -- and it found the scaffolded
> `Directory.Build.targets` carrying `--debug` inside an XML comment, which
> MSBuild refuses; fixed before the step was reported.
>
> **Three rounds.** Round 1: a declared pack without `{version}` was
> silently ignored (now refused by name); the test did not assert what a
> consumer's restore reads (it does: the feed `nuget.config` names, the pin,
> the artifact under that id and version); `module pack` let a
> configuration error escape as a stack trace (every refusal prints as one
> line). Round 2 asked for a test that runs a real consumer restore, which
> the block's committed test budget forbids ("no test runs `dotnet` or
> `mvn`; the real toolchains are exercised by a step's own check"); disputed
> with the budget and the check on the record, and withdrawn in round 3.
> Router suite 1,098 tests (1,094 passing, 4 skipped), extension 196.

> ## SESSION 102 CLOSED, 2026-09-06, VERIFIED (round 5, gpt-5.4 over the seat, cap raised to 5 on the record; landed 594bca00) -- designed contracts and contract-test source, and the ecosystem seam
>
> Four steps. **The ecosystem seam** (`ecosystem.ts`): `ecosystemOf(root,
> entry)` chooses `dotnet` or `maven` from what a module's roots contain (a
> `.csproj` or solution file; a `pom.xml`; neither and both refused by
> name), and every ecosystem-specific decision of the block is a method of
> it -- contract project names, the surface reader, the contract scaffold
> now; the root files, the pack default, the focused-checkout convenience
> file and the grant mechanism as the block adds them -- with the Maven side
> refusing by name until session 108. **The contract bundle** has one shape:
> `modules/<slug>/contract/README.md` is the author's notes page (five
> sections plus examples and what callers must not depend on), and for a
> `designed` or `generated` contract `<Package>.api.md` is the public
> surface. `dabbler contractdoc --module <slug>` renders it: the .NET
> reader takes every `public` declaration with its `///` summary from the
> abstractions project's source (interface members are read as the public
> declarations they are, tracked by braces; an attribute between summary and
> declaration keeps the summary) and marks the page *designed*; `generated`
> runs `modules.<slug>.contract.generate` and marks the page *shape, not
> behaviour*; `package` has no surface page; a declared seam with no notes
> page is refused by path, and a `contract.yaml` beside the page renders
> into it between markers, the author's prose kept and the block
> regenerated in place. **`dabbler module contract <slug>`** (a new verb,
> `module`, for the things done to one module) scaffolds the designed seam
> for a .NET module only where absent, naming each file: `<Package>.
> Abstractions` (a placeholder interface with a doc comment),
> `<Package>.ContractTests` (an abstract xunit class, `OutputType Library`
> over `xunit.v3.extensibility.core` -- xunit v3 refuses a library that
> references the runner core, which the real build found), the
> implementation's test project wired to it with a subclass, and the notes
> page; `--against <provider>` writes a compatibility test project with an
> unversioned `PackageReference` to the provider's package and never a
> `ProjectReference`; the central pins the new references need are added
> where missing. The real toolchain was the step's own check: a copy of the
> POC repository, scaffolded, built both projects with `dotnet build`.
> **A module's contract bundle sits under its suites' covers** by derivation
> in a multi-module shape, so a change to it moves the suites' freshness;
> single-module derives nothing. Six router tests.
>
> **Five rounds, four of them on one sentence of the plan.** Round 1: the
> module form wrote no notes page (fixed), the reader dropped interface
> members (fixed), the Maven side returned guessed project names (now
> refuses). Rounds 2-4 turned on what "renders the notes page from a
> `contract.yaml` beside it" means: a third file was refused (round 2),
> overwriting the author's page was refused (round 3), creating the page
> from the yaml alone was refused (round 4); the resolution is the one
> above -- the page is the author's and must exist, and the definition
> renders into it between markers. The round cap was raised from 3 to 5 for
> this run with the reason and the approver on `amendments.jsonl`. Router
> suite 1,092 tests (1,088 passing, 4 skipped), extension 196.

> ## SESSION 101 CLOSED, 2026-09-06, VERIFIED (round 2, gpt-5.4 over the seat, one dispute withdrawn; landed 33557781) -- module configuration, the exception schema and the test-impact vocabulary
>
> Four steps, every one inert for a single-module solution. **A suite says
> which module it proves** (`module`), what it is (`role`: `unit` |
> `provider-contract` | `consumer-contract`) and, for a consumer-contract
> suite, which provider it runs `against`; **`required_for_close`** is its
> own word beside `expensive` (default the same value), so a suite can run
> as the run of record and be recorded as information without being the
> close's obligation (`freshnessVerdict` marks `required` by it, and
> `judgeFreshness` demands only those). `module` and `against` are held to
> the manifest only when the loader is handed a multi-module shape. **The
> work plan gains `modules` and `reason`**: `judgeWorkPlanModules`
> (`driver.ts`) refuses at acceptance an undeclared slug by name, two
> modules without a reason, a multi-module plan naming no module, and a
> single-module plan naming anything but its own module -- the plan file is
> removed and the instruction comes back as a rejection under
> `[plan-modules]`; in a multi-module solution the modules go on the
> declaration entry and the session record (`sessions.schema.json`,
> `progress-projection.schema.json`, so `dabbler status` prints them) and a
> single-module record carries no member; `session declare --module` is the
> typed form. **`modules:` in the root `dabbler.yaml`** (`moduleConfigs`,
> `modules.ts`): per-slug `packaging`, `sharedFiles`, `contract.generate`,
> unknown keys and undeclared slugs refused by name; `loadDeclaration(config,
> slug)` answers the module's packaging block or the root's; `{version}` is a
> recognised placeholder and a pack that names it with no version to give is
> refused. **Selection gains the module form** (`checks.ts`): a changed path
> under a module's roots, or among its shared files, selects that module's
> suites whole (`module-changed`) and each transitive consumer's
> consumer-contract suite against it (`consumer-contract`, found by the
> manifest's reverse edges); a rule may `select: [{module: <slug>}]`;
> `SelectionResult` carries `suites` and `modules`; `dabbler affected` prints
> them and hands a whole-selected suite its bare command. Seven router tests.
>
> **Round 1 found two blocking findings and a nit.** A shared file reached only the first module whose `sharedFiles` named it (fixed: every naming module is reached, and the test's central pins are shared by two); the typed `session declare --module` bypassed the judge the driven plan meets (fixed: one judge, `judgeModulesForShape`, for both paths, and `--reason` on the typed form); and a claim that the module form had to be wired into the preverification gate -- disputed with evidence, because that phase runs nothing by design since the session 70s and the run of record runs every expensive suite whole until session 106 replaces it with the impact plan -- which round 2 withdrew. Router suite 1,085 tests (1,081 passing, 4 skipped), extension 196.

> ## SESSION 100 CLOSED, 2026-09-06, VERIFIED (round 2, gpt-5.4 over the seat; landed 19d621c5) -- the solution plan and the module manifest; the six-step workflow deleted
>
> The first of the nine sessions of the modules block
> (`docs/sessions/session-plan.md`, "Why sessions 100–108 exist"; Sol's
> round-9 review of the plan is `docs/design/consults/round9-*.md`, six
> corrections adopted and two declined on the operator's handoff). Five
> steps. **The manifest** (`modules.ts`) gains `kind` (`shared-types` |
> `library` | `application`), `dependsOn` (must exist; a cycle is refused
> naming it), `package` and `contract` (`designed` | `package` |
> `generated`; a declared package is its own abstraction until somebody
> designs one); consumers are derived (`consumersOf`, transitive, in
> dependency order) and never written; **`solutionShape(root)` is the one
> function that says which shape a repository is in** -- an absent manifest
> is one implicit module (the repository, `codeRoots: ["."]`), one entry is
> single, two are many -- and every later session asks it. `dabbler modules
> create` takes `--kind`, `--depends-on`, `--package`, `--contract` and
> rewrites the projection; `dabbler modules show` prints the shape with
> `usedBy` per module. **The projection** the Solution Explorer reads is
> `projection.ts` over the manifest (dependency order, `usedBy`, the
> contract folder when the tree has it; the secondary mode's `external` and
> `members` unchanged). **Bootstrap** writes a one-module `docs/modules.yaml`
> by default (the second entry is what switches the module machinery on)
> and its two setup sessions are rewritten around
> `docs/planning/solution-plan.md` -- one module is a fine answer; a
> repository with `project-plan.md` amends that file -- carrying the plan,
> decompose and contracts deliverables the workflow held. **The six-step
> component workflow is deleted**: `solution.ts`, `cli/workflow.ts`,
> `cli/solution.ts`, `workflow/*`, `stepreview.ts`, `testphase.ts`,
> `fixloop.ts`, their five test files, the `workflow` and `solution` verbs,
> this repository's own `solution.yaml`; `contractdoc` draws its diagram
> from the manifest. **The Solution Explorer renders modules**: rows in
> dependency order with depends-on and used-by children only where there is
> something to list, one row and nothing under it for a single-module
> solution, the empty state naming session 1; New Module asks kind and
> depends-on. Router suite 1,076 tests (1,072 passing, 4 skipped; 89 fewer than before, the deleted workflow's), extension 196.
>
> **Round 1 found two blocking findings and a nit, all fixed:** `modules
> create` did not rewrite the projection (it does, with a test); the
> scaffolded session 2 named only `solution-plan.md` where the prompt named
> the `project-plan.md` fallback too; the extension's walkthrough text still
> said "project plan". Round 2 verified.
>
> **The single-module requirement held.** `walk-session.test.ts` and
> `walk-bootstrap.test.ts` pass unchanged in substance; a bootstrapped
> repository reads as single-module and nothing module-shaped switches on.
> One trap for the next session: a bare `.` in YAML 1.1 is a number, so a
> scaffolded `codeRoots` entry is quoted.

> ## HANDOFF, 2026-09-06 — what the next session is asked to do, and everything it needs
>
> **The ask.** Plan the modules block as numbered sessions appended to
> `docs/sessions/session-plan.md` (session 100 onward), then start
> implementing it with session 100 under the pull loop. The design is
> decided and recorded; do not re-open it. **One requirement the design
> records were written without and that governs every session: a
> solution with ONE module must keep working exactly as today, with
> nothing new asked of its developer.** csv-model is such a solution, and
> so is every repository bootstrapped so far. Multi-module behaviour
> switches on when `docs/modules.yaml` declares more than one module;
> with one, the repository *is* the module — no focused clone, no
> packages folder, no contracts, the run of record is the module's own
> suites, the Solution Explorer shows one module row. Bootstrap must
> therefore write a valid one-module manifest by default (one entry,
> its `codeRoots` the repository) so that nothing changes for the
> existing shape, and a single-module repository may still be one member
> of a many-repository solution through the secondary mode.
>
> **Read first, in this order.** `docs/design/consults/round8-synthesis.md`
> (the decision as it stands; it amends round 7, which amends round 6 —
> read those two for the reasoning, not for the design),
> `docs/design/developer-walkthrough-modules.md` (the developer's day,
> step by step, with what exists and what the block adds),
> `docs/design/module-checkout-poc.md` (the compile story, proven in 16 s
> at `C:\temp\modules-poc`). The advisors' full answers are beside the
> syntheses (`round6-*`, `round7-*`, `round8-*`); Sol's round 8 is the
> most concrete on the testing surface.
>
> **The design in ten lines.** A trunk monorepo, `modules/<slug>/`. A
> solution plan first (`docs/planning/solution-plan.md`) as a reviewed
> hypothesis, written by session 001 and challenged by 002. Sibling
> modules are consumed as **committed packages** from one tracked folder
> (`packages/`, relative path in `nuget.config`, pins in
> `Directory.Packages.props`, immutable sortable dev versions, a size
> ceiling with LFS above it). Each module's **contract is designed**: an
> abstractions package, a separate `<Module>.ContractTests` package the
> implementer's tests inherit, consumer-owned compatibility tests, and a
> notes page under `modules/<slug>/contract/`; generation from the built
> assembly is a marked fallback. A session runs in a **disposable
> blob-filtered sparse clone** holding its module, the root build files,
> every dependency's contract and package, and the reverse consumers'
> contract-test assets — no sibling implementation on disk or in the
> object store. The engine's working directory is that clone (Claude
> Code also gets `permissions.blockReadsOutsideWorkingDirectories`). A
> sibling's source is reached only by a **grant** (`dabbler module grant
> <sibling> --reason … [--debug]`, an owed decision the operator answers;
> `revoke` narrows; a temporary project-reference overlay lives outside
> committed files; Source Link is off in engine sessions). Cross-module
> work is `modules: [a, b]` with a reason. The **candidate package and
> contract are generated before the run of record**, and the run of
> record is **one impact plan** shared with `dabbler affected`: the
> changed module's unit and provider-contract suites plus each transitive
> consumer's consumer-contract suite against the candidate, per-suite
> freshness as it exists today; the land commits the tested bytes
> unchanged, by direct push for a team of one or the existing candidate
> gate for a team. The verifier **refuses** out-of-scope reads; an
> **exposure manifest** (sibling implementation bytes present, target
> zero; grants; files changed outside scope) is recorded at start and
> close. Bundling is recorded in `release/<bundle>/bundle.yaml`, never
> executed; module-keyed `packaging` blocks under `modules:` in the one
> root `dabbler.yaml`. Encryption of sibling source is a hardened custody
> profile designed only for a named customer. Containers likewise.
>
> **What exists in this tree to build on — extend these, do not build
> beside them.**
> - `docs/modules.yaml` and `packages/router/src/modules.ts`
>   (`ModuleEntry {slug, title, planPath, codeRoots, touches,
>   specSections, contextAssets}`, unknown keys refused), written by
>   `dabbler modules create` and the extension's **New Module**
>   (`tools/dabbler-ai-orchestration/src/commands/newModule.ts`), read by
>   `approvedPlan.ts` to flag `integration-module` risk from `codeRoots`.
>   The block adds `dependsOn`, `package`, `contract`, `kind`
>   (`shared-types` | `library` | `application`) and reverse consumers
>   derived, never declared.
> - The verifier's scope and record: `agency.ts` `sessionScope`,
>   `inScope`, `recordForRound` (counts today; must refuse), the
>   exposure fields go beside `fidelity_measurable` in
>   `schemas/rounds.schema.json` + `src/generated/rounds.ts`.
> - Test evidence: `testEvidence.ts` — per-suite freshness over `covers`
>   (`enumerateSurface`, `evaluateFreshness`) exists; the run of record
>   in `drive.ts` (`expensiveSuites()`, ~line 2373) runs every expensive
>   suite whole and is what the impact plan replaces; `checks.ts`
>   `selectTests` selects by test FILE (`isTestFile` over
>   `test_roots`/`test_glob`) — selection needs a module form derived
>   from the manifest; "required for close" needs its own word beside
>   `expensive` (a non-expensive suite is skipped by the close gate,
>   ~line 305).
> - The land: `drive.ts` `phaseLand` (direct push) and candidate mode
>   (`release.gate: candidate` in `dabbler.yaml`, `candidateTrunk`,
>   `phaseGateWait`) — the two team shapes, both kept.
> - Owed decisions: `owedDecisions.ts`, `dabbler owed`, the extension's
>   **Answer Owed Decision** — the grant is a new subject for them.
> - Packaging: `packaging.ts` (`loadDeclaration`, `feedTakesCredential`,
>   the `declared` field from session 99), `cli/packaging.ts`;
>   `bootstrap/detect.ts` `detectPackaging` now reads a root solution
>   file. Module-keyed blocks are an extension of this, not a rewrite.
> - Contracts: `contractdoc.ts` and `dabbler contractdoc` ("render a
>   module's contract from its declaration") — repoint to the designed
>   contract bundle.
> - The secondary mode, kept as is: `solutionDeps.ts`
>   (`solution-dependencies.json`), `dabbler deps
>   check/show/feeds/source/restore/locate/clone/scaffold`,
>   `resolution.ts` (source mode; keep, it is the debugging hatch), the
>   plan's `repositories` member (`drive.ts` ~line 1624), `dabbler
>   workspace`.
> - The Solution Explorer: `tools/dabbler-ai-orchestration/src/providers/
>   solutionTreeModel.ts` (node kinds `solution`, `component`,
>   `contract`, `usedBy`, `consumer`, `progress`, `external*`,
>   `member*`; drift kinds `behind`/`ahead`/`feed`/`split`), rendering
>   `.dabbler/solution/projection.json` written by
>   `packages/router/src/workflow/project.ts`. Components become modules;
>   `progress` goes; new rows: package + version, contract, run-of-record
>   status, who pins it, grants, bundles, *shipped in*.
>
> **What to delete, and when.** The six-step component workflow:
> `packages/router/src/solution.ts`, `cli/workflow.ts`,
> `workflow/commands.ts`, `workflow/log.ts`, `workflow/terminal.ts`,
> `stepreview.ts`, `testphase.ts`, their tests, the `solution.yaml`
> scaffold in `bootstrap/`, and the extension's rendering of its step
> state — after its decompose/contracts prompts are moved into the
> session 001/002 templates. **Keep `workflow/project.ts`** (the
> projection writer the Explorer reads) or move it; keep
> `contractdoc.ts`. About 3,600 lines go; this is session 100's largest
> single change and the one that makes room.
>
> **The nine sessions (round 8's list; → marks a real dependency).**
> 1. Solution plan and module manifest: the manifest extension with the
>    single-module default; bootstrap's 001/002 rewritten around the
>    solution plan; the six-step workflow deleted and its prompts moved.
> 2. Module configuration, exception schema, test-impact declarations
>    → 1: `modules:` in the root `dabbler.yaml` (per-module packaging,
>    tests, contracts, allowed shared files), `modules: [a, b]` + reason,
>    "required for close", module-form selection.
> 3. Designed contracts and contract-test source → 1: abstractions,
>    `ContractTests` packages, consumer compatibility tests, the notes
>    page; `contractdoc` repointed; generation as the marked fallback
>    (.NET first).
> 4. Committed immutable packages → 3: the tracked feed folder, sortable
>    dev versions, the ceiling and LFS above it, restore that refuses to
>    rebuild an absent sibling, exact source/contract/package
>    correspondence.
> 5. The focused checkout → 1–4: `dabbler module open <slug>` (the
>    disposable filtered clone, `.slnf`, working directory, the Claude
>    Code block), reverse-consumer contract assets in the cone, and the
>    **Windows preflight** (clone, restore, antivirus timing on the
>    operator's machine; a persistent per-module clone reset at open is
>    the fallback if a clone per session is too slow).
> 6. Module-scoped sessions, hard verifier scope, exposure manifest,
>    grants → 5: `grant`/`revoke` with the overlay; the Work Explorer
>    grouped by module again.
> 7. The impact plan and the selected run of record → 2, 4, 5: one plan
>    for `affected` and the driver; candidate bytes first; reached suites
>    only.
> 8. The atomic land → 7: tested bytes are the landed bytes; drift; the
>    exposure ceiling; direct push or the candidate gate per the
>    manifest; bundles recorded.
> 9. Maven parity and the hardened profiles → 1–4, 7.
>
> Each session ends as every session does: verification, the run of
> record, the land, the close. The single-module requirement is a test
> in every one of them: csv-model's shape (one module, `dotnet test`
> whole) must pass through unchanged, and the walkthrough test
> (`walk-session.test.ts`) is that repository's stand-in here.
>
> **How to plan it.** Append the sessions to `docs/sessions/session-plan.md`
> in the shape of sessions 90–99 (a header `### Session 100 of 108: …`,
> an italic preamble saying what is confirmed in the tree, numbered
> steps with one test per behaviour, "Affected; verify; full suite as
> `final-full`; close" last, and a test-budget paragraph). Commit the
> plan with a plain message, then `dabbler session start --sessions-dir
> docs/sessions --engine claude-code --provider anthropic`, then `dabbler
> session next` until `done`. Run the router from this tree
> (`node packages/router/dist/dabbler.cjs`), which is 2.0.3.
>
> **Operating notes learned in session 99, so they cost nothing twice.**
> - The land prefixes `Session N:` onto the plan's `task` paragraph; a
>   task that begins "Session N:" lands as "Session N: Session N: …".
>   Start the task with the work.
> - A step's report names only files that changed; a file whose only
>   change was line endings is *unchanged* to the driver (git normalises
>   them), whatever `git status` shows.
> - `dabbler session plan amend --step X --files … --checks-file …
>   --reason … --approver …` widens a step mid-session; a schema change
>   drags `schemas/*.json` + `src/generated/*.ts` into the step
>   (regenerate with `node packages/router/scripts/run-ts.mjs
>   packages/router/scripts/generate-types.ts`; the `compile` control
>   checks freshness).
> - A `wait` is answered by a later `next`; the honest thing to wait on
>   is the job's `<job>.status.json` mtime under
>   `.dabbler/runs/s<N>/driver/jobs/`, not repeated `next` calls. The
>   run-of-record wait now derives its number from the suite's last
>   duration.
> - Nothing may touch the tree between a report and the `next` that
>   judges it, nor after the last step until the close.
> - A version bump is `version.json` → `npm run stamp:version`, never the
>   manifests (the run of record went red on exactly this). After the
>   session: bump, `npm run build`, `npm run package -w
>   dabbler-ai-orchestration`, `code --install-extension <vsix> --force`,
>   commit "Version X: …". The framework runs the DIST.
> - `docs/design/consults/` holds briefs and answers; the consult script
>   is one `route()` call with `transport: "api"` (see any round's
>   header for the model and tokens).
>
> **Owed, small, for session 100 to sweep or defer explicitly.**
> `cli/packaging.ts` `explain()` prints "Using the credential named" with
> nothing after it for a folder feed without a secret; `FIDELITY_UNREADABLE`
> could say "missing" alone now that a directory is a listing; the
> doubled `Session N:` prefix (the land could refuse to double it);
> `job-finished-stale` after a cap-clean settle (from 98); csv-model's own
> re-bootstrap onto 2.0.3 is one command the operator runs there.
>
> **Rules in force.** The unattended-work directive (decide by the six
> rules, record which decided it, do not wait); no-skip cross-provider
> verification every session; state files and `.dabbler/runs/` are
> router-written only; the ground rules at the top of `AGENTS.md` are
> what returns when the replacement works — no new module without
> deleting one is easy this block, the six-step workflow pays for all of
> them.

> ## THE NEXT BLOCK, DECIDED 2026-09-06 — one repository, one module per session, a solution plan first
>
> **Amended again by consult round 8
> (`docs/design/consults/round8-synthesis.md`), on the operator's three
> objectives: convenient for the developer, fewer unnecessary reads, and a
> testing surface that does not run whole suites when a module is a
> compiled library.** Both advisors converged, and Sol corrected round 7
> in five places, each checked in the tree: the contract is **designed**
> (an abstractions package, a separate `<Module>.ContractTests` package
> the implementer's tests inherit, consumer-owned compatibility tests, a
> notes page) with generation only as a marked fallback; the candidate
> package and contract are generated **before** the run of record so the
> tested bytes are the landed bytes; the focused checkout carries each
> consumer's contract-test assets, never their implementation; the direct
> push is the team-of-one shape and the existing candidate gate the team
> shape; and **the run of record changes** — one impact plan shared by
> `dabbler affected` and the driver runs only the changed module's unit
> and provider-contract suites plus each transitive consumer's
> consumer-contract suite against the candidate package, with per-suite
> freshness (which already exists over `covers`); a shared-types change
> runs all transitive consumers, never "everything"; the integration lane
> is trunk CI and the release session. `selection.rules[].select` names
> test files today, so selection gains a module form from
> `docs/modules.yaml`; "required for close" becomes its own word beside
> `expensive`. Debugging across the seam is `dabbler module grant <sibling>
> --reason … --debug` / `revoke` with a temporary project-reference
> overlay outside committed files and Source Link off in engine sessions.
> The session checkout is a **disposable filtered clone per session**
> (Sol), never a worktree of the full checkout; Gemini's Windows cost
> (antivirus, restore) is measured in a preflight before rollout, with a
> persistent per-module clone as the fallback. Encryption is a hardened
> custody profile designed only for a named customer, and never a one-time
> pad. Nine sessions now; session 100 is still the solution plan and
> module manifest.
>
> **Amended the same day by consult round 7
> (`docs/design/consults/round7-synthesis.md`), on the operator's
> reframing: "we want to prevent AI from reading more code than it needs
> to read … what if the code is in a child directory in the repo."** Both
> advisors, this time in agreement, put the wall on the disk: a session
> runs in a **dedicated blob-filtered sparse clone** holding the module's
> source and tests, the shared root build files, and every dependency's
> **contract** and **package** — no sibling implementation exists in it (a
> worktree beside a full checkout would share its object store, so it is
> a clone). The AI reads a **generated, committed contract** per module
> (`modules/<slug>/contract/`: GenAPI-style stubs or `javap` output with
> the doc comments and a short human notes page, regenerated at every
> land beside the package; the existing `contractdoc` verb is repointed).
> Packages are committed (the follow-up decision stands). The verifier
> **refuses** out-of-scope reads instead of counting them. The measure is
> **exposure** — sibling implementation bytes present in the session's
> filesystem, target zero — recorded in an exposure manifest at start
> and close; counting reads is the wrong metric (this session: 137 Bash
> calls to 6 Read), transcript audits are diagnostics at most, engine
> path rules are defence in depth for Claude Code only, `.slnf` is
> convenience, containers are a hardened mode. Cross-module work is
> `modules: [a, b]` with a reason, reported. "Prevent" means ordinary and
> accidental reads; deliberate retrieval is not prevented and the
> framework says so. The eight sessions are re-ordered: plan+manifest;
> module config + exception schema; **contracts**; committed packages;
> **the focused checkout**; module-scoped sessions + hard verifier scope
> + exposure manifest; the atomic land with drift, ceiling and bundles;
> Maven parity + secondary mode. The paragraph below is round 6 as
> decided; where it says "rule first" or "sparse worktree", round 7
> governs.
>
> The operator asked, after the csv-model trial finished, for a better
> developer experience around a *solution*: a solution plan before the
> repository plan, the solution broken into local libraries, and — as the
> mechanism — one repository with one branch per library, where a branch
> holds that library's source and every other library as a committed
> compiled artifact. Sol (`gpt-5.6-sol`) and Gemini (`gemini-3.1-pro`)
> were consulted on it (`docs/design/consults/round6-*.md`); both reject
> the branch mechanism for the same reasons (nothing to merge, no base for
> a pull request, no authoritative tree for CI, binaries in history, N-1
> fan-out per producer change, and no team of skilled developers works
> that way), and both deliver the proposal's goals with a **monorepo, a
> directory per module** — the July module decision, and the shape of the
> operator's own `D:\Projects\dabbler-csv-pipeline`. The decision and its
> reasoning by rules (a)–(f) are in
> `docs/design/consults/round6-synthesis.md`; the five slides: one trunk
> monorepo; a solution plan first, as a reviewed hypothesis
> (`docs/planning/solution-plan.md` + `docs/modules.yaml`, session 001
> authors, session 002 challenges; the six-step `solution.yaml` workflow
> is deleted); sibling modules as packages from one gitignored root
> `.local-feed/` registered by a relative path in a tracked `nuget.config`,
> rebuilt by the framework under an immutable dev version
> (`1.3.0-dev.<digest>`); a session sees one module — the driver refuses
> files outside its roots, the verifier's scope is the module, the
> extension opens its `.slnf`, and `dabbler module open <slug>` gives the
> physical wall the operator asked for as a framework-made sparse
> worktree on a short-lived session branch (the advisors' one
> disagreement; both are built, rule first); bundling recorded in
> `release/<bundle>/bundle.yaml` and never executed, with module-keyed
> `packaging` blocks under `modules:` in the one root `dabbler.yaml` and
> round 5's local-byte gate at a releasable close. Eight day-sized
> sessions are listed in the synthesis, with their real dependencies.
> There are no public 2.x users (the Marketplace serves 1.0.4), so the
> breaking change breaks nobody; `solution-dependencies.json`, the plan's
> `repositories` member and `deps clone/scaffold` stay as the secondary
> mode for a solution that really is several repositories.
>
> **What the operator can overrule with one word:** the focused worktree
> (Gemini calls it over-correction; Sol calls the rule-only wall theatre
> because the engine's reads are never mediated); keeping source mode
> (Gemini would delete it); immutable dev versions (the round-5 instinct
> was "a human just rebuilds", which is right about attestations and
> wrong about NuGet's cache). Session 100 should be the first of the
> eight: the solution plan, the module manifest, and the deletion of the
> six-step workflow.

> ## SESSION 99 CLOSED, 2026-09-06, VERIFIED (round 2, gpt-5.4 over the seat; landed 9956ec6e) -- csv-model's sessions 5 and 6, and session 98's papercuts
>
> Eight steps, each an entry from `D:\Projects\csv-model\docs\
> framework-notes.md` written after session 98 was planned, or a papercut
> session 98's own close recorded, confirmed in this tree first. The
> packaging detector reads a root solution file and names the one packable
> project below it (`detectPackaging`, `bootstrap/detect.ts`) instead of
> saying a pack would fail — csv-model's did not, six checks and a real
> publish over. `dabbler packaging --dry-run` says "No gate was asked"
> beside a releasability refusal instead of "every gate passes", exits 0
> when the declaration loads and releasability is the only obstacle (one
> field, `declared`, on the run), and — found by the step's own test —
> the config schema still *required* `packaging.push.secret`, so the
> folder-feed exemption in `loadDeclaration` was unreachable through a
> real `dabbler.yaml`; `secret` is optional in the schema now, and the
> help and the scaffolded comment say a folder feed takes none. The
> selector maps the framework-installed `.claude/settings.json` to no
> test (one definition, `isFrameworkInstalledPath`, moved down into
> `checks.ts` because `gates.ts` already imports `testEvidence.ts`, which
> imports `checks.ts`); `session start` says the file lands with the
> session's commit. `dabbler bootstrap` runs `git init` where there is no
> repository (the extension's Set Up New Project already did) and says a
> remote is needed before the first close; the sessions-root error names
> `git init`, not `--sessions-dir`. `readFidelity` reads the disk before
> the framing (a guessed path is "not a file here", not "no line numbers
> on this transport"), a `view` of a directory is recorded as a listing,
> and a shown line that is the disk line cut short says so. The fix step's
> ask stops promising the affected tests; the projection note names
> `dabbler`; candidate mode gates onto the branch HEAD is on
> (`candidateTrunk`, both sites) instead of a literal `origin/master`;
> `writeAtomically` retries a rename once on `EPERM`/`EBUSY`. The
> run-of-record `wait` names a quarter over the suite's last recorded
> duration, floor ten, ceiling sixty (`suiteRetrySeconds`). The guide
> counts four kinds under the pull and `interrupt` only from `drive`,
> shows the verification job rather than an affected-tests job that no
> longer runs, and says what a check's environment is, what moves the
> tree, what `affected` measures, and what `retry_after_seconds` is; the
> plan ask says the check-environment and `repositories` sentences.
> Nine router tests. Two `plan amend`s (the schema and its generated type
> joined step 2; `gates.ts` joined step 3).
>
> **The run of record was red once, and it was right again.** Round 1
> verified the tree; the complete suite then failed one test:
> `version.json` still declared 2.0.1 while the 2.0.2 version commit after
> session 98 had bumped both manifests by hand, against the rule the file
> itself states. The fix step set `version.json` to 2.0.2 (the report
> naming `package-lock.json` too was refused — the stamp had only rewritten
> its line endings, which git normalises away, so the driver was right
> that it had not changed); every step's checks re-ran, round 2 verified,
> both suites green (1161 + 209). Router and extension are **2.0.3**,
> rebuilt and installed after the close.
>
> **Not carried, on purpose:** `run.json`'s `engine: cli` and
> `max_invocations` under the pull (a record shape with no reader that
> cares); the facts row's `changedLines` omitting a deleted file (the
> verifier's scope names it; `deletedFiles` is a schema change for a
> session that needs it); a build identifier in the record when the
> version string does not move (the framework developer's own case; 2.0.2
> was bumped). **Owed to the next session:** the dry run's explanation
> still prints "Using the credential named" with nothing after it when a
> folder feed declares no secret (round 1's nit, one line in
> `cli/packaging.ts` `explain()`); `FIDELITY_UNREADABLE` could say
> "missing" alone now that a directory is a listing (round 1's second
> nit); the land prefixes `Session N:` onto a task paragraph that may
> already begin with it (this session's commit title reads `Session 99:
> Session 99: …` — the plan ask should say the task starts with the work,
> or the land should not double it); `job-finished-stale` after a
> cap-clean settle (from 98) is still unexamined. **The csv-model
> repository's own re-bootstrap** onto this router is one command the
> operator runs there (`dabbler bootstrap --no-transport-detect`), and its
> open notes entries are answered by this router.

> ## SESSION 98 CLOSED, 2026-09-06, VERIFIED (three rounds, gpt-5.4 over the seat; landed e3e9ef2e) -- what the csv-model notes found, fixed and measured
>
> Nine steps, every one an entry from `D:\Projects\csv-model\docs\
> framework-notes.md` confirmed in this tree; the notes file is the
> operator's and is marked from the csv-model side. The local gate receipt
> names the branch HEAD is on (`localGateReceipt`, drive.ts) and refuses a
> detached HEAD instead of writing `master`; the Claude Code stop hook is
> installed by `session start` for a `claude-code` registration
> (`installStopGate` is unguarded; bootstrap keeps its CLAUDECODE guard at
> the call site), so the extension's Set Up New Project no longer leaves it
> out; `start` ends with one line naming `session next` and no typed
> recipe; every job the driver spawns carries `DABBLER_DRIVEN=1`
> (`jobs.startJob`) and `verify` under it prints the verdict and "The
> driver runs the rest." -- this session's own verification log ends with
> exactly that; `dabbler version` and `--version` print the router's
> version and the extension's when a manifest with `engines.vscode` sits
> above the package root; `project-work-plan.md` renders "## The plan"
> only when `session plan` recorded one (folding each session's task
> paragraph in was rejected: the plan would read as whichever session ran
> last); the managed body, the plan template, the scaffolded
> `dabbler.yaml` comments (`when` is a path prefix, not a glob; the four
> control kinds), `next --help`, the driving guide and the `run-started`
> line under the pull (`mode=pull`, no invocation bound) say what the
> code does, and AGENTS.md was regenerated from the rebuilt bundle.
>
> **The measurement, `docs/copilot-cli-walkthrough.md`.** One gpt-5-mini
> call on the seat (0 premium requests): Copilot CLI 1.0.83's `view`
> returns `content` as the file's raw text with no line numbers, and
> `detailedContent` as a unified diff of the file against itself whose
> hunk header numbers every line. The transport dropped `detailedContent`;
> it keeps it now, `readFidelity` numbers lines from hunk headers, and the
> `^\d+\.` regex -- which graded csv-model's session plan `transformed`
> because its first line is `1. Register.` -- is gone. A read of the
> transport's own handoff payload is recorded as kind `handoff`, in
> scope, not counted (the round schema admits the kind), and the handoff
> bootstrap says to read the file once. Proven on this session's round:
> 24 of 25 reads verbatim, one handoff read (csv-model's session 3 had
> nine), `fidelity_measurable: true`, no findings. Across csv-model's five
> sessions before this, zero reads were verbatim.
>
> **The run of record was red once, and it was right.** Round 1 verified
> the tree; the complete suite then failed four tests. Three were
> `walk-session`: registering under claude-code now writes
> `.claude/settings.json` into a fresh repository, and the plan step's
> declaration refused a tree that "already carries 1 change" -- a defect
> this session's own step 2 introduced and only the walkthrough could
> see. `materialPaths` (gates.ts) now treats that one file as the
> framework's install rather than the session's work; the land commits
> it. The fourth was the rounds test asserting the typed recipe while the
> suite itself ran as a job the driver had marked `DABBLER_DRIVEN=1` -- the
> test now clears the marker it never controlled. The `fix-run-of-record`
> step was judged and every step's checks re-ran -- session 96's
> papercut, fixed in 97, seen working -- and round 2 then refused the
> fix, correctly: the first version exempted `.claude/settings.json` from
> the worktree gate for the close as well as the declaration, so an
> operator's uncommitted edit to it would have landed unseen. The
> exemption is now one shape: the UNTRACKED file, when the declaration
> asks whether work has begun (`beforeWork`, gates.ts); a tracked edit is
> work, and the close sees the file however it got there.
>
> **Papercuts for the next session.** (1) `readFidelity` checks the
> framing before the disk: a read of a file that does not exist (the
> verifier guessed `packages/router/src/git.ts`) is graded `unverified:
> the view tool returns no line numbers on this transport`, which is the
> wrong reason -- check readability first, then framing. (2) The
> candidate-mode receipt and `phaseGateWait` still name `origin/master`;
> a `main` repository in candidate mode would fail there. (3) A transient
> Windows `EPERM` on renaming `run.json` killed one `next`; the retry
> judged the report normally -- `saveRun` could retry the rename once.
> (4) `PROJECTION_NOTE` in writers.ts still says `ai_router.writers`.
> (5) The synthesised fix step's ask (drive.ts, "Make the fixes. The
> framework will run the affected tests, ...") still promises the affected
> tests; step 9's pass reached the templates and the guide, not that
> string. (6) After round 3 settled from the record, the run-of-record
> site collected the just-finished verification job as
> `job-finished-stale` -- harmless, but the row reads as if something was
> left behind.
>
> **Two things about the pull, learned by being refused.** A step's
> report must name only the files that changed, even when the plan's
> `files` lists more: the plan tolerates a byte-identical file
> (`step-file-unchanged`), the report does not (`files-changed-
> unchanged`). And `session plan amend --step X --files ...` is how a step
> widens mid-session; it was used twice here, both times because the
> round schema pins an operation's kind and a new kind drags the schema
> and its generated type into the step.

> ## SESSION 98 PLANNED, 2026-09-06 — what the csv-model notes found
>
> The operator's test repository, `D:\Projects\csv-model`, keeps
> `docs/framework-notes.md`: every confusion and every suspected bug the
> agents met running its sessions 1–4 on router 2.0.1 today. Twenty-eight
> entries; each open one was checked against this tree before session 98
> was written, and the session carries only what the code confirmed.
> Defects: the gate receipt's branch is the literal `"master"`
> (`drive.ts`); the Claude Code stop hook installs only when bootstrap
> itself runs under Claude Code, so the extension's Set Up New Project
> never installs it; `session start` and the driven `verify` job both
> print the typed-verb recipe into a pull that forbids it; the Copilot
> CLI verifier spends up to 41 % of a round's tool calls re-reading the
> transport's own handoff file, counted out-of-scope, while every real
> read is graded unverified because `readFidelity` expects `N. text`
> lines the 1.0.83 `view` tool evidently no longer returns; there is no
> `dabbler --version`; and the work-plan view says no plan is recorded
> forever. Guidance the code has left behind: the managed body and the
> session-plan template still promise the affected tests run before
> verification, `next --help` and the driving guide still say `next`
> registers, and `run-started` under the pull prints a bound that does
> not apply. The plan block says which of these is a fix and which is a
> decision; the notes file itself is not edited here.
>
> Not carried into 98, because they are conventions or not the router's:
> the notes-lag convention, the `SKIP` row before a suite exists, the
> publish pass-through (working), Copilot CLI 1.0.83 (working over
> `copilot-cli`), the .NET 10 `.slnx` default, and the deleted-file
> report, which is one sentence in the step ask and rides in step 8.

> ## SESSION 97 CLOSED, 2026-09-05, VERIFIED (round 2, gpt-5.4 over the seat) -- the last session the plan declares
>
> The engine interface exists and nothing in the lifecycle calls it.
> `packages/router/src/acp.ts`: open a conversation (fresh, or resumed BY
> ID and never by recency), send one message, receive structured events,
> cancel -- with the Agent Client Protocol over stdio (`copilot --acp`)
> and Claude Code's stream-json as two implementations of the one
> interface. What the client answers when the agent asks permission is a
> POLICY stated on the connection -- `allow` answers allow-ONCE, never
> allow-always; `deny` answers reject; a request after a cancel is
> answered `cancelled` -- and never a prompt forwarded to nobody.
> `dabbler agent prompt` is its only caller: an `open` line with what was
> negotiated, one JSON line per event, a `turn` line last. Ten tests over
> scripted peers (`acp.test.ts`); the live record is
> `docs/acp-walkthrough.md`, measured on Copilot CLI 1.0.83 with
> `gpt-5-mini` (0x): `loadSession: true`; a tool call arrives as
> `tool_call` -> `session/request_permission` (allow_once, allow_always,
> reject_once) -> `tool_call_update`, and the file is on disk before the
> completion event; an edit asks and a read does not; a denial is
> `status: failed`, `code: rejected`, after which gpt-5-mini ended the
> turn with no text at all; `session/cancel` is answered `end_turn` with
> no usage, not the protocol's `cancelled`, so the client reports
> cancelled from its own knowledge; `session/load` replays the whole
> history before its own reply, and a session closed with
> `session/close` is still loadable. The Claude Code implementation is
> scripted-peer only; its permission channel is unmeasured.
>
> Session 96's two papercuts are fixed. `run.json` carries
> `pending_step` {id, ask, then}; `drive.ts` writes it when it issues a
> synthesised step and the loop head judges it before any phase's own
> work, so under the pull a `fix-run-of-record` report is judged, its
> checks run and the repaired tree is verified again before the suite
> reruns -- walk-session proves the order: round 1, red run of record,
> fix asked, round 2, green, close. The suite's temp root is swept at
> the start of the next run: every directory under it is named for the
> pid of the run that made it (`repo.ts scratchDir`), a finished run's
> go at once, a live run's stay, and an unlabelled name goes after an
> hour. Round 1 refused the first version, which pruned by age only,
> and it was right; the plan text said "at the start of the next one".
>
> **A finding, not acted on.** The seat's `session/new` reply lists
> every model it can dispatch with a `copilotUsage` multiplier
> (gpt-5-mini 0x, gpt-5.4 1x, gpt-5.5 7.5x, gemini-*-flash 14x,
> claude-fable-5 15x, opus-4.8-fast 30x) -- free, no billed probe. Read
> with the note under session 96: those are the legacy request
> multipliers, not prices under per-token billing, and they disagree
> with the lock's samples in places (gpt-5.4 1x against the lock's 0;
> claude-fable-5 15x against 1). Whatever the owed seat-cost re-base
> uses, this is where the seat states its own weights, and the verb
> prints it on every open.
>
> **Next block, the operator's to plan.** Adopt `acp.ts` behind a flag:
> verification first, once session 95's cost legibility is proven on a
> real run; then the driver's engine adapters in `engines.ts`; then the
> watcher's nudge. Measure Claude Code's `--permission-prompt-tool
> stdio` channel live before anything relies on it. The plan declares no
> further session.

> ## SESSION 96 CLOSED, 2026-09-05, VERIFIED (two rounds, gpt-5.4 over the seat)
>
> The git seam is used. Ten non-walkthrough test files that built real
> repositories now take a directory answering git's questions from a table
> (`test/support/answers.ts`: `makeAnsweredRepo`, `makeAnsweredSandbox`,
> `GIT_INIT`; `write-tree` answers a digest of the files on disk), and the
> four assertions that were about git moved into `walk-bootstrap` and
> `walk-git-states`. `test/support/no-git.ts` is a `--import` preload that
> fails any worker outside a `walk-*` file the moment it spawns git, and
> `dabbler.yaml` runs the suite under it with no `--test-concurrency=4`:
> 1133 pass, 4 skipped, 17 s at Node's default worker count (32 s capped
> at 4 before). The guard found four more files the plan had not counted
> -- rounds, route, solutionDeps, workflow -- one of which (route) had been
> reading THIS repository's config overlays through `projectRoot()`.
>
> **Two framework papercuts, on the record for session 97.** (1) Under
> the pull, a `fix-run-of-record` step is never judged and never
> re-verified: `phaseRunOfRecord` re-enters from its loop head on the next
> call, re-runs the suite, and lands; the close's `verification_clean`
> gate refused, correctly, and `dabbler verify` round 2 satisfied it. Its
> checks (`allPlanChecks()`) never ran either. (2) `test/support/repo.ts`
> named template directories by pid and counter; the temp root is never
> cleaned (425 templates, 17k entries), Windows reused a pid, and
> `walk-verify` died at load on `git remote add origin`. Fixed with a
> mkdtemp name; the root's cleanup is still nobody's.
>
> **After the close, the seat catalog (operator-requested):** the lock is
> re-dated to CLI 1.0.83; `gemini-3.1-pro-preview` is gone from Copilot
> and its entry removed; `gemini-3.8-flash` added and confirmed. **The
> lock's `probe_premium_requests` samples are not prices.** GitHub moved
> to usage-based per-token billing on 2026-06-01 (AI credits, $0.01
> each; docs.github.com/en/copilot/reference/copilot-billing/
> models-and-pricing); Gemini 3.8 Flash is $0.75/$3.75 per M tokens,
> among the cheapest on the seat, while the probe sampled 14. Legacy
> request multipliers apply only to annual Pro/Pro+ plans that stayed on
> them, and that table has GPT-5.5 at 57, not the 7.5 the lock holds.
> Owed: re-base seat cost (session 93's legibility, the refresh's
> cheapest-first order, the trial's 364 figure) on tokens times the
> published rate. Until then, nothing should steer model choice by the
> samples. Sessions 82-95 wrote no handoff here; their record is
> `docs/sessions/change-log.md`.

> ## SESSION 81 CLOSED, 2026-09-02, VERIFIED at adjudication (the third)
>
> Publishing without a secret: the Marketplace workflow federates (OIDC
> to Entra, ids in repository variables, vsce --azure-credential,
> azure/login pinned to the SHA the live v2 tag resolves to), the PAT
> path is gone, and the never-used Open VSX mirror went with it -- the
> last stored secret removed by removal, revival path named. The
> operator's one-time Azure steps are copy-pasteable in
> docs/planning/marketplace-release-process.md. quick-start gains 2b:
> the four-word vocabulary (start, run, interact, cancel) and session
> next is now addressed to engines only.
>
> **The skip defect is root-caused.** Sessions 78 and 81 both slid
> through run-of-record and close: longWork answers EXIT_OK for a
> standing job under another name -- true inside one phase's walk,
> false across phases, so an uncollected verification job after an
> adjudication fake-greens every later phase. Forensics for both are
> under .dabbler/scratch/; both sessions were completed honestly through
> the verbs. The one-branch fix (collect and clear the mismatched job,
> then start your own) is 82's step 2, engine-run, before the trial
> trusts any tail.
>
> **Waiting on the operator tonight:** the Azure one-time setup (the doc
> above, ~15 min); delete any OVSX_PAT left in GitHub settings (nothing
> references it); the 2.0.0 release word (dabbler release); then 82's
> walk -- now with a .NET xunit leg beside csv-model, per the
> language-neutrality directive.
>
> ## SESSION 80 CLOSED, 2026-09-02, VERIFIED at adjudication (the second 3-0)
>
> The liveness guardian, claude-code tier: lease epochs on the run record
> with compare-and-swap saves under the lifecycle lock, failing CLOSED on
> contention with a supervision row; stale reports refused with the
> outstanding seq in the words; the watcher split into acknowledgment,
> liveness and progress clocks, each reading carrying a recommended
> action, spinning jobs escalating at a named five-threshold constant;
> supervision.jsonl as the append-only spend-and-refusal record;
> `dabbler session run` driving a whole session in one command with
> watcher-only degradation; the Claude Code stop gate installed by
> bootstrap, additively, only under a Claude Code host. This session's
> own tail exercised 79's machinery live: 69 seals beside the run of
> record and the local gate receipt at the land. The boundary control
> caught its own builder mid-session (a dynamic-import knot from the
> first draft of session run) and the fix moved the code rather than
> baselining the edge.
>
> ## SESSION 79 CLOSED, 2026-09-02, VERIFIED at adjudication
>
> Boundaries declared (ten contexts, every module a member, both
> directions checked in lint); 69 seals accrue beside every green run of
> record from the next driver build; the six-sentinel band runs in under a
> second and caught two real defects on its first day (verb-closed
> sessions never showing Work done; report() accepting a stale seq -- the
> first lease fence now refuses that with the outstanding number in its
> words); the candidate gate exists dual-mode with receipts, and the
> git-only wait needs no CI vendor. Rounds 1-3 blocked on scope beyond the
> amended plan; all four disputes were OVERRULED by the adjudicator
> (gemini-flash/google) citing the plan text. Owed to the follow-on scope,
> on the record: surface digest and run-id in the receipt, the scripted-CI
> gate harness, seal enforcement with per-library suites.
>
> ## SESSIONS 77-78 CLOSED, 2026-09-02, both VERIFIED
>
> 77: the `journal.runGit` seam, a 15-test contract band, recorded answers
> for the heaviest repo-builders (240 build sites to 124); the residue is
> concentrated -- `drive.test.ts` alone held half the suite -- and named
> in `vitest.config.ts`. 78: the targeted pre-verification run REMOVED
> whole (phase, verify gates, heal loop; the stage survives read-only);
> the module knots cut from 52 back-edges to 4, both surviving pairs
> baselined with reasons in `packages/router/boundary-baseline.json`, and
> the boundary now holds inside the existing lint control, dynamic imports
> counted. drive.test halved (647s to 334s) as a side effect.
>
> **One defect, on the record for session 80:** at 78's tail the
> run-of-record and close phases were skipped silently -- two driver
> processes (a detached check sweep and foreground calls) wrote one run,
> and the framework has no lease epoch to refuse the stale writer.
> Forensics in `.dabbler/scratch/s78-skip-forensics/`. The session was
> completed honestly through the verbs afterwards: a real final-full
> (582 s), a real close, every gate PASS. This specimen is session 80's
> strongest argument: instruction leases make it impossible by
> construction.
>
> Language-neutrality (operator, 2026-09-02): everything consumer-facing
> speaks argv, declared file sets and git -- `dotnet test` and `mvn test`
> sit where `python -m pytest` sits today, and 78's deletion of targeted
> selection removed the one per-ecosystem piece. Session 82 gains a .NET
> trial leg when its entry is amended; the TS-only boundary scanner is
> self-governance for this repo, not a consumer feature.
`experiment/verification-pipeline-v3` and `design/solution-decomposition`
are merged and finished. Earlier handoff text is in `docs/status-archive.md`.

> ## THE QUEUE REWRITTEN, 2026-09-02: sessions 77–82, from the design record
>
> A day of design with the operator and two outside seats (GPT-5.6 Sol,
> Gemini 3.1 Pro; three rounds, all in `docs/design/consults/`) settled
> the architecture: libraries and mini-workflows as sealed blackboxes
> (framework-computed digests, git only for landing), a dual-mode merge
> gate (master only moves to a full-ledger-green exact SHA; CI where it
> exists, a local executor where not; executor failover, never a typeable
> bypass), five per-workflow sentinels as the fail-fast layer, the
> descent tree held behind a measured threshold (p ≈ 4% against
> crossovers of ~27%/6.7%/3.3% at 90/180/300 s), and a conversation-first
> liveness guardian (leases with epochs, free-observable clocks, stop-gate
> continuation, budgets not confirmations). Session 75's trial is revived
> as session 82, operator-performed. Publishing moves to Entra workload
> identity federation — no stored secret; the one-time Azure steps are
> the operator's, documented in session 81.
>
> The operator is away 2026-09-02; the orchestrator (claude-code) drives
> 77 onward back to back on their instruction, and the operator performs
> 82's UAT on return.

> ## SESSION 76 CLOSED, 2026-09-02: what a session starts, a session ends
>
> The operator's performance feedback, done as patches -- everything
> mechanical, nothing that touches the evidence flow. The incident was two
> processes found idle on 2026-09-02: an extension `test:unit` tree 38
> hours old and a Playwright test-server 12.7 hours old, ~230 MB between
> them, reaped by hand.
>
> **The spawn audit, path by path.**
>
> - **Declared checks, engines, the Copilot seat, the extension's driver**
>   all spawn through `checks.spawnProgram`, and shell strings (a check's
>   `command`, the suite `test-evidence run` starts) now go through its
>   twin `spawnCommand`. Both track the child in a module-level registry;
>   the router's own end -- SIGINT, SIGTERM, SIGHUP, or a plain exit with a
>   child still live -- ends every tracked tree. Before this, `execute`
>   ended a check only on its timeout and `runChild` only on an interrupt's
>   ten-second fallback; a router that died any other way left the tree.
> - **`test-evidence run`** used a blocking `spawnSync` through a shell with
>   no `windowsHide`: a process blocked in one cannot observe the signal
>   that would let it end its child, and a kill of the router left `cmd →
>   npm → mocha` running. That is the shape of the 38-hour tree. It is an
>   asynchronous, tracked, hidden spawn now.
> - **Jobs** (the suite, a verification round, the close) are detached by
>   design and outlive the `next` call that starts them; nothing ended one
>   when the run was abandoned. `terminateTree` takes a pid now, `jobs.endJob`
>   ends a job by its runner's pid (only if that pid is still alive -- the
>   OS reuses them), the driver's one Stop catch ends a live job before the
>   stop row is written (`session interrupt --stop` read while the pull was
>   waiting on the job is the common case) and logs `job-ended`, and a job
>   collected with no exit code is ended too. The job runner spawns its
>   child as its own POSIX group and ends that tree on the signals it can
>   observe.
> - **The extension's drive registry** had a `dispose()` that killed every
>   driver and nothing registered it; `sharedDrives()` is on
>   `context.subscriptions` now, so a closing window ends its drivers and,
>   through the registry above, what they ran.
> - **The Playwright launch seam** records the Electron root pid and
>   `closeVSCode` -- and the failed-launch path -- end the tree by force
>   when `app.close()` rejects or exceeds 15 s.
> - **The Playwright test-server is not ours.** Nothing in this repository
>   -- no script, workflow or spec -- names or starts one. It is the
>   Playwright VS Code extension's own process, started when it loads a
>   workspace holding a playwright config, and outside this repository's
>   reach. Closing that extension's test explorer, or the window, ends it.
> - **What nothing here can observe:** a `taskkill /F` of the router itself
>   with no `/T`. The registry needs a signal or an exit; `endJob` and the
>   extension's tree kill are what reach a child from outside after that.
>
> **The last two windows.** `terminateTree`'s `taskkill` now builds through
> `treeKillCommand`, which composes `hiddenSpawn`; the suite spawn is hidden
> through `spawnCommand`. Every spawn site in the router carries
> `windowsHide`.
>
> **Workers yield, and the count stays at two -- on the numbers.** A vitest
> setup file (`test/support/priority.ts`) puts every worker at below-normal
> priority, inherited by every `git` and `node` the suite forks. Then the
> whole suite was measured at 2, 4 and 8 workers, one run each, with a
> normal-priority probe beside each run as the keyboard's proxy (idle p50
> 76 ms):
>
> | workers | wall  | test time | probe p50 / p95 |
> |---------|-------|-----------|-----------------|
> | 2       | 702 s | 1384 s    | 134 / 232 ms    |
> | 4       | 705 s | 2256 s    | 206 / 306 ms    |
> | 8       | 717 s | 3500 s    | 292 / 453 ms    |
>
> More workers return nothing: the wall clock is the longest files'
> critical path, and every worker past two only contends. The stale 138 s
> claim in `vitest.config.ts` is replaced by that table. **D256 amends the
> plan item** from "raise to the highest usable count" to the highest count
> the measurement supports, which is two; verification round 1 asked for
> that amendment to be explicit rather than implied. **The operator's own
> feel of the machine was not sampled** -- the probe stood in -- and their
> confirmation of the count is owed: it is the one thing on this session's
> record that only the operator can supply. Raw numbers were in
> `.dabbler/scratch/measure/`, untracked.
>
> **Round 1 also caught a real defect in the runner.** The job runner had
> spawned its command detached on POSIX -- its own group -- so `endJob`'s
> kill of the runner's group could never reach it there, and a command that
> exited clean after starting a helper left the helper running with a
> clean status beside it. The runner now keeps its command in its own group
> (Windows needs no group: libuv's job object takes a non-detached child
> with its parent, and `taskkill /T` walks the rest), walks what is still
> alive under the command before it writes the status -- by parent pid on
> Windows, where orphans keep a dead parent's pid; by group on POSIX -- and
> ends it, and sweeps its whole group on its own exit. A POSIX helper that
> puts itself in a new session is the one thing out of reach, on purpose.
> Three job tests, all real trees: poll, abandon, collect.
>
> **Baseline for 77.** Session 76's `final-full` duration on the record
> is what session 77 -- the git seam, the recorded-answer fixture, the
> deletion of ~240 scratch repositories per run -- is measured against. Two
> workers at ~700 s is the number to beat; `drive.test.ts` alone runs for
> over six minutes, and it is the critical path.

> ## THE PLAN MOVED, 2026-09-02: 75 cancelled, performance is next
>
> The operator, after session 74 closed: performance first. Session 75 —
> the Marketplace trial — is **cancelled** by `session cancel`, reason on
> its row in `sessions.json`: its one precondition, `vsix-v2.0.0` served,
> will not be met while nothing is published. Sessions **76** (performance
> patches: orphan reaping, the last two visible console windows, worker
> priority) and **77** (the git seam: a contract band of real-git tests,
> everything else fed recorded answers) are appended to the plan. A third
> session — library boundaries with per-library digests and a checked
> absorption rule — is drafted but NOT in the plan: the operator wants the
> approach discussed further first. `restore` is the road back for 75 if a
> later plan revives the trial.

> ## PAUSED BEFORE PUBLISHING, 2026-09-02
>
> The operator: *"Please pause and wrap up this session without publishing"*
> and *"We need to make some significant changes before publishing."* So
> session 74 closed with its work landed and **nothing was tagged**: no
> `vsix-v2.0.0`, no npm version, and the Marketplace still serves 1.0.4.
> Session 75 -- the trial -- is NOT started, because it exists to check a
> published artifact and there is none.
>
> **The publication brief is answered `publish` on the record**, from
> before the change of course. Nothing acts on that answer by itself --
> `dabbler release` has to be run and it is not -- but the next session to
> touch this should either re-raise it against whatever the significant
> changes turn out to be, or record a decision superseding it. An answered
> brief that no longer means what it says is the kind of thing this record
> is supposed to catch.
>
> ## THE DISTRIBUTION CHANGED, 2026-09-02: npm is retired
>
> **The operator's call, made while the npm publish was failing on its third
> first-run defect, and it was the right one: the premise had died and
> nobody had noticed.** npm was never needed. The extension BUNDLES the
> router — `esbuild.js` emits `dist/dabbler.cjs` beside `dist/extension.js`,
> and the terminal shim points at it — so the `dabbler` command that has
> driven every session since the port resolves to the installed VSIX and
> never to a registry. What npm bought was `npm i -g dabbler-ai-router` on a
> machine with no extension, which nothing here does. In v1 the PyPI
> dependency was real, because a Python CLI had no other delivery route; the
> port removed it, and continuing was following a plan whose reason had
> expired.
>
> **And the number is 2.0.0, not 2.8.0.** The Marketplace serves **1.0.4**
> (2026-08-18, twenty installs) and nothing 2.x has ever been published
> anywhere. 2.8.0 would tell a reader that seven minor releases happened
> since 1.0.4; they were bookkeeping between two people. 2.0.0 is greater
> than 1.0.4, which is all the Marketplace requires, and it says the true
> thing: one rewrite.
>
> **Session 74 does it** — `version.json` to 2.0.0 and stamped everywhere,
> `release.yml` deleted, `tagsFor` down to one tag (`vsix-v<version>`), the
> publication brief rewritten without an npm half, `--verify-install` asking
> the Marketplace instead of the registry, and every document that says `npm
> i -g dabbler-ai-router` corrected. csv-model feedback item 5 was never a
> defect in the product: it was a wrong instruction. **Session 75 is then
> the trial**, against what the Marketplace actually serves.
>
> **Nothing is owed on the credential side, and an earlier line here said
> otherwise — it was wrong. The evidence, so this is checkable rather than
> asserted:**
>
> ```
> $ gh api repos/darndestdabbler/dabbler-ai-orchestration/environments/marketplace/secrets
> {"total_count":1,"secrets":[{"name":"VSCE_PAT",
>   "created_at":"2026-05-05T01:19:31Z","updated_at":"2026-05-29T20:21:10Z"}]}
> ```
>
> `gh secret list` reads REPOSITORY secrets and there are none; `VSCE_PAT` is
> bound to the `marketplace` **environment**, which is where
> `publish-vscode.yml` reads it (`environment: marketplace`, then
> `secrets.VSCE_PAT`). Reading an empty repository-level list as "no secrets
> at all" was the mistake, and the corrected claim is checkable by anyone
> with the same command.
>
> **And it demonstrably works**, which is stronger than the secret merely
> existing: `vsix-v1.0.1` through `vsix-v1.0.4` were published by that same
> workflow on 2026-08-17 and 2026-08-18, and the Marketplace serves 1.0.4
> today. A publish job cannot succeed without the credential it authenticates
> with.
>
> The environment also requires a reviewer's approval, so a `vsix-v*` tag
> starts the publish and the operator approves it once. 2.0.0 goes out as a
> **stable** release.
>
> **The npm attempt left nothing behind.** No version was ever published;
> `v2.8.0` is deleted. Three workflow defects were found and fixed on the
> way, each only reachable after the one before it, and they are recorded
> here because the same shapes wait in any first publish: `npm pack` needs
> its `--pack-destination` to exist; `npm publish dist/x.tgz` resolves as a
> package SPEC and tried `git ls-remote ssh://git@github.com/dist/…tgz.git`,
> so the path needs a leading `./`; `--provenance` on an unseen package
> requires an explicit `--access public`. The fourth was not a defect at
> all — OIDC trusted publishing authorises against settings that only exist
> for a package that exists:
>
> ```
> npm error 404 Not Found - PUT https://registry.npmjs.org/dabbler-ai-router
> npm error 404  ... could not be found or you do not have permission
> ```
>
> It was always going to hit that once, and the answer is not to solve it:
> the product does not need the registry it was asking permission from.
> **Session 75 is the trial**: `dabbler release --verify-install` as a step
> check -- asking the Marketplace what it serves -- then acceptance criteria
> 1 and 2 from a clean profile, then item 5 of the audit closes on that
> verification. `docs/field-trial-70.md` holds the expected answers, written
> before the run.

> **Session 73 — the last two CI failures, and the tilde. CLOSED `VERIFIED`
> in one round, 2026-09-02 (`9a96d9c3`).** A `~` was not in `fixloop`'s
> path-token class, so a traceback naming any Windows 8.3 short name
> (`C:\Users\RUNNER~1\...`) implicated nothing and a fix round was handed an
> envelope with the failing file missing — a production defect that only a
> runner could show. `drive.test` asserted the spelling it was handed, as
> `packaging.test` had. And every script that exited by hand now sets
> `process.exitCode`: `check:types` had printed *31 generated module(s) match
> the schemas* and then failed the step on libuv's `UV_HANDLE_CLOSING`
> assertion, which is a control lying about its own result.

> **Session 72 — the rest of the runner's conditions. CLOSED `VERIFIED` in
> one round, 2026-09-02 (`3ac7826e`). CI went from about fifty failures to
> TWO of 1263.** `canonicalPath` now canonicalises the deepest ancestor that
> exists and re-appends the rest, so a not-yet-written file no longer keeps
> the spelling it was handed — session 71's own new test caught that on the
> runner. Every fixture repository declares its own `user.name`,
> `user.email`, `commit.gpgsign` and `core.autocrlf` through one `initRepo`,
> because the framework commits through its own `runGit` and a bare runner
> has no identity to borrow. And `bootstrap` was a THIRD production comparer
> of the same family: it staged its own scaffold with a raw `relative()`, so
> in a repository reached through an alias it committed nothing and reported
> the scaffold already committed.
>
> **`packages/router/scripts/aliased-temp-suite.mjs` reproduces the whole
> runner now** — `TEMP` aliased through a junction, `GIT_CONFIG_GLOBAL` and
> `GIT_CONFIG_SYSTEM` pointed at nothing, and `user.useConfigOnly` set so git
> refuses to guess an identity the way a runner does — and it takes the
> suites to run as arguments. It is why three causes were found in minutes
> instead of eight-minute round trips.
>
> **The two that remain are session 73.** A `~` in a path — every 8.3 short
> name has one — is not in `fixloop`'s path-token character class, so a
> traceback naming such a path implicates nothing: a production defect, not a
> test one, and the fix round's envelope silently loses the file the failure
> points at. And `drive.test` asserts the spelling it was handed, as
> `packaging.test` did. Beside them one flake: `check:types` prints *31
> generated module(s) match the schemas* and then exits 1 on a libuv
> assertion at `process.exit()`.

> **Session 71 — one canonical spelling for every path comparison. CLOSED
> `VERIFIED` in one round, 2026-09-01 (`4eff83c2`). CI IS STILL RED, and
> session 72 is the rest of it.**
>
> **What it fixed, and it was real:** `canonicalPath` and `repoRelativePath`
> now sit beside `repoRootFor` in `journal.ts` — git answers with its own
> spelling, a caller's is whatever they were handed, and Windows spells one
> directory several ways. Every comparison that DECIDES containment asks them
> now: the bookkeeping exclusion (`gates.ts`), the evidence digest
> (`testEvidence.ts`), the step-report filter (`drive.ts`), the plan envelope
> (`approvedPlan.ts`), the verifier's read scope (`agency.ts`, where a wrong
> answer is a security answer) and `solutionDeps`' crosses-out-of-this-
> repository test. Message formatting still uses `relative` and says so. The
> `sessions.json` failures that made twelve runs red are **gone from the
> runner's log**.
>
> **What it did not reach — four things, same family, all in session 72's
> plan.** (1) `canonicalPath` falls back to `resolve` for a path that does
> not exist yet, so it keeps the spelling it was handed and a comparison
> against a canonical root mismatches again — *session 71's own new test
> caught this on the runner*, which is the test doing its job. (2) The suite
> borrows the machine's git identity, and the runner has none, so a fixture's
> `git commit` fails with *please tell me who you are* and the driver's land
> phase stops. (3) `packaging.test` asserts the spelling it was handed. (4) A
> `fixloop` traceback frame carries a short-form path.
>
> **Two controls exist now and both are worth keeping:** a junction alias in
> `gates.test.ts` reproduces the runner's two spellings without a runner, and
> `packages/router/scripts/aliased-temp-suite.mjs` runs the failing suites
> with `TEMP` pointed at an alias — the runner's condition on this machine.
> It spawns vitest through `process.execPath` rather than `npx`, whose
> Windows `.cmd` form `spawnSync` refuses outright.

> **Session 70 — one version, and the trial written down before it runs.
> CLOSED `VERIFIED` in two rounds, 2026-09-01 (`e453bb58`).** Driven from my
> own CLI; zero engine invocations.
>
> **READ THIS FIRST: `Test` is red and has been since session 66 — twelve
> consecutive runs — and both release workflows are gated on a green `Test`
> for the tagged commit, so NOTHING CAN BE PUBLISHED until it passes.** The
> cause is one bug, and the runner's own log carries both halves of the
> evidence: `os.tmpdir()` hands the fixtures the 8.3 short form
> (`C:\Users\RUNNER~1\...`) while `git rev-parse --show-toplevel` answers with
> the long one (`C:/Users/runneradmin/...`). `gates.ts:sessionsRel` computes
> `relative(root, sessionsDir)` from those two unresolved spellings, so
> `setRel` is nonsense, the bookkeeping exclusion never matches, and
> `docs/sessions/sessions.json` counts as the session's own work — every test
> that declares a task list fails with *the working tree already carries 1
> change(s)*. It is green here because this machine's temp path has no short
> form. **Session 71 is that fix**, and `resolvedPath` already exists in
> `gates.ts` to expand it; check every other caller that compares a path
> against git's answer.
>
> **The plan's precondition for the trial was not met and could not be met.**
> Nothing is published: `registry.npmjs.org` has never served
> `dabbler-ai-router`, there is no `v2.*` or `vsix-v2.*` tag, and no
> `publication` brief had been raised. Nor could this session publish:
> `dabbler release` refuses a tree that is not clean and a driven tree is
> dirty until its land phase, **so the session that changes the version can
> never be the session that tags it**. That is `dabbler.yaml`'s own model — a
> session prepares a release, a tag push makes it — and the trial is now
> session 72, after the fix and after the operator answers.
>
> **One version, 2.8.0, stamped from one source.** `version.json` is the
> source; `npm run stamp:version` writes it into both manifests, the
> extension's dependency on the router and the lock file; `npm run
> check:version` fails on a stale one; and `releaseVersion` in `cli/release.ts`
> refuses to tag against a stale manifest, naming the file and the command.
> The first draft was one number in two manifests plus an equality check, and
> the verifier was right to call that a merge nothing stamps: it would come
> apart on the next bump. 2.8.0 rather than 2.7.0 because 65–69 landed after
> 2.7.0 was set and nothing was ever published as 2.7.0.
>
> **`docs/field-trial-70.md` is the trial, written before it is run** —
> criteria 1, 2 and 5 with their expected answers stated first, so the
> acceptance run is a test rather than a demonstration. **Criterion 5 is
> satisfied rather than restated**: all nine `csv-model` feedback items now
> carry a linked test (four written here — the icon geometry, the Solution
> Explorer's welcome, per-subcommand `--help`, and the file the freshness
> gate's remediation names) or, for item 5 alone, a dated deferred issue
> owned by the operator, closing on the recorded verification session 72 runs.
>
> The extension is **2.8.0** and unpublished, as is the router.

> **Session 69 — the round cap, and the Solution Explorer across
> repositories. CLOSED `VERIFIED` in two rounds, 2026-09-01 (`24e4fa5e`).**
> Driven from my own CLI through `dabbler session next`; zero engine
> invocations.
>
> **The round cap is no longer typeable on a driving call.** `session next`
> and `session drive` REFUSE `--max-rounds` — refused rather than ignored,
> because the option parser takes any `--flag value` pair and a silently
> dropped flag is worse than a stated limit. The cap is
> `verification.settings.max_rounds`, and for one run it moves only through
> `dabbler session plan amend --max-rounds N --reason … --approver …`, which
> writes `run.json` and appends the before, the after, **the rounds already
> run**, the reason and the approver to `amendments.jsonl`. **No gate reads
> the approver**, and the comments say so: an engine writes it, and a gate
> that trusted it would make the authorisation forgeable, which is worse than
> absent. What the row buys is that the claim exists and is reviewable —
> unlike session 68's `"max_rounds": 4`, which arrived with no reason at all.
> The driver's at-cap refusal now names the amendment instead of the flag.
>
> **Three location states, not two.** The projection carries `remote` and
> `declaredPath` beside `root`, and one exported rule in the tree model —
> `externalLocation` — decides *here* / *remote* / *unknown*, with the three
> context values following it. A known remote nobody has cloned is a command
> away; only an undetermined one needs a person. A declared path that is not
> there says so rather than claiming nobody said where it lives (round 1's
> nit). The four actions an absent row had none of are now `dabbler deps
> locate | clone | scaffold` — router verbs, because **the extension must
> never author `solution-dependencies.json`**: two writers for one tracked
> declaration drift, and only one of them can be schema-checked. The three
> writing verbs rewrite the projection afterwards, so the row the operator
> acted on stops saying the thing they acted on.
>
> **The upstream direction, without a second declared one (D254).** A
> repository appears in the Explorer because **its own declaration names this
> solution** — one home, owned by the repository the fact is about. So the
> projection gained `members`, both directions derived (`provides` off this
> repository's edges, `consumes` off that member's), and `usedBy` is
> untouched.
>
> **A work plan may name the repositories it needs.** Round 1's blocking
> finding was right: scaffolding only through a typed command still left the
> operator to remember the next repository. `driver-work-plan.schema.json`
> gained an optional `repositories: [{id, path?}]`, and `phasePlan` places
> each one when the plan is accepted — through `placeMember`, the single rule
> `deps scaffold` calls too. A shell is a directory, a `git init` and a
> membership declaration; no edge, no `produces`, no version. An existing
> declaration is left exactly as it stands, and a plan naming repositories in
> a repository with no `solution-dependencies.json` stops with that sentence.
>
> Two papercuts fixed on the way: `dabbler deps` resolved its repository root
> from `docs/sessions`, so it answered "not inside a git repository" in any
> repository that had never run a session — including one it had just
> scaffolded; it now falls back to the working directory.
>
> The extension is still **2.7.0** and predates 65 through 69.

> **Session 68 — the logic-tree harvest. CLOSED `VERIFIED` in five rounds,
> 2026-09-01 (`ce31a28d`).** Two of those five rounds were authorised by the
> operator past the cap of three; **D253** records why. Driven from my own CLI;
> zero engine invocations.
>
> **The reconciliation came first, and paid for itself.** All eighteen findings
> were read against the source before any was acted on
> (`docs/logic-harvest-68.md`): sixteen reproduce, and three claims do not —
> F3's "the budget stop's count increments so two never compare equal" (`invoke`
> refuses *before* spending an invocation, so they do compare equal, and a test
> now pins it), F14's "silent" (it is the loudest thing the framework says), and
> F15's "no Send channel either" (session 63 built one). Both reviewers assert
> things this codebase does not do; **take `gpt-5-6-sol`'s structural claims
> seriously and check `gemini-3-1-pro`'s scenarios before quoting them.**
>
> **What landed in the machine.** Verification's terminal states have an edge
> out: `noRoundReason` is stated once in `verify/rounds.ts` and asked by both
> its own refusals and `phaseVerify`, so a terminal row or a clean at-cap round
> **over an unmoved tree** advances to the run of record instead of stopping a
> correct session forever — and a *moved* tree stops with what to do, because a
> repair after the last reviewed round is unreviewed work. The UNRESOLVED cap
> has its own exit code (`EXIT_UNRESOLVED`), so the dispositions→fix→preverify
> →verify cycle cannot run on a finding that cites no path, and the consumed
> disposition set is cleared once its fix step is issued. Releasability has one
> owner: `phasePublish` reads the DECLARATION, and
> `published_when_releasable` demands an outcome of `published` and joins
> `EVIDENCE_GATES` so `--force` cannot skip it. The packaging outcome tokens
> moved to `ledger.ts` so the gate can ask without a cycle.
>
> **`dabbler session rebaseline`** gives *halted, being repaired* its edge:
> valid only while the run carries a stop, it records the absorbed paths and the
> reason to `repairs.jsonl`, moves `baseline_tree`, and raises an
> `accountability-signoff` decision. The driver's own files-changed refusal now
> names it. **The watcher gained its second rule** — `job-outstanding`, a job
> past the threshold whose log has stopped growing — because the rule shipped in
> 67 is quiet whenever a job runs and was blind in exactly the window a wedged
> round occupies.
>
> **THE LIFECYCLE MODEL WAS NOT ADOPTED, AND IS NOT IN THE TREE IN ANY FORM.**
> The plan made it binary — held to the code, or deleted — and holding it means
> every real transition declared *and* every declared transition observed. The
> suite drives 21 of 38 phase edges; six of the other 17 are self-loops a phase
> line cannot show at all. Three attempts to land less were refused by the
> verifier, each correctly: an `exercised` flag (an exemption), deleting the
> unexercised transitions (equality bought by narrowing the machine), and
> keeping the whole thing as a Markdown table under a "snapshot, not a source"
> disclaimer (a disclaimer is not a control; the rule is about the model, not
> the file extension). **Adopting it is a session**: instrument `setPhase` and
> the `Stop` constructor so self-loops are observable, then write the 17 tests.
> `docs/logic-harvest-68.md` names the price; the harvest's own copy stays in
> `C:\temp\dabbler-logic-harvest\`, outside the repository.
>
> **Twelve findings carried**, each with where it belongs: F1's entry question,
> F6 (the close is terminal before its own bookkeeping; push mode cannot
> recover), F7's job ceiling, F9 (`runRoundCap` exists and is unused), F10, F11,
> F12, F13, F14, F16, F17, F18. F6, F17 and part of F18 are one machine — the
> session-status one — and should land together.
>
> The extension is still **2.7.0** and predates 65 through 68.

> **Session 67 — the watcher, and the driver's blind spots. CLOSED
> `VERIFIED` in one round, 2026-09-01 (`de953825`).** Driven end to end from
> my own CLI through `dabbler session next`; zero engine invocations, which
> is what the pull is for.
>
> **`WORKERS_LOCAL` is 2.** The operator's call after a four-worker run of
> record made the host unusable and had to be killed. Measured on the
> twenty-core host: 20 workers 94 s wall / 873 s test time, 4 → 106 s /
> 352 s, 2 → 138 s / 262 s. A third more wall clock is what a machine you
> can still type on costs. `WORKERS_CI` stays 1.
>
> **`lastActivityAt` reads the driver's directory.** It read the ledger, the
> activity log and the verification rounds and never `driver/run.json`,
> `instruction.json` or `report.json` — so mid-session 66, two hours in with
> eight steps accepted, it answered with the registration and
> `possiblyStalled` was true through the whole productive stretch. It now
> reads all three through the driver's own readers.
>
> **The watcher line.** The rule that separates the two silences — *an
> instruction issued, no answer written since it was issued, no tree change
> since, past the threshold* — is stated ONCE, in `driver.ts`:
> `watcherReading` (pure), `readWatcher` (the reader) and `treeTouchedAt`
> (a `git status --porcelain` probe that skips `.dabbler/`), exported from
> `index.ts` alongside `stalledAfterSeconds`. The Dabbler terminal renders
> it as `watcher since=Ns state=instruction-outstanding` in `warn` — a new
> `lineTone` case, no new machinery — asking the rule at most twice per
> threshold so the probe is never a git call per 500 ms poll. The headless
> case rides the interrupt poll `invoke` already runs, on the driver's own
> log channel; no companion process was needed. **The answer side is the
> answer FILES, not the run record**: `issue()` writes the instruction and
> saves `run.json` a millisecond later, so a rule comparing `updated_at` to
> `issued_at` reads "answered" for every outstanding instruction there has
> ever been. The headless test is what caught it.
>
> **The driver reads `verify`'s reason.** `phaseVerify` re-reads the refusal
> from the job log (`jobLogTail`, on the deterministic path a job name
> gives). A stale pre-verification precondition now heals — `setPhase
> ("preverify")`, which is exactly the run that makes it true again —
> bounded at two by `preverify_heals` on `run.json`, and the stop it
> eventually raises carries verify's own words instead of the one sentence
> every refusal used to arrive in. That sentence is why the deadlock
> classifier called a red control and stale evidence the same impasse.
>
> **`session plan amend` is the ordinary move.** Two steps needed a file the
> plan had not declared; the engine signs its own amendment and the
> before/after lands in `amendments.jsonl`. Cheaper and more honest than
> working around the envelope.
>
> The extension is still **2.7.0** and predates 65, 66 and 67.

> **Recorded, 2026-09-01, after sessions 65 and 66 — the csv-model
> papercuts, the publish gap, and CI's first green run in weeks.** Both
> closed `VERIFIED` in two rounds each. **The plan now runs to 70 and the
> renumbering is landed**, as a doc-only commit between sessions on the
> operator's call, 2026-09-01: 67 is the watcher and the driver's blind
> spots, 68 is the logic-tree harvest and the control that holds it to the
> code, 69 is the Solution Explorer going multi-repository, and the
> publication trial is 70. **Register 67 with `--total-sessions 70`.**
>
> Landing it here rather than inside session 67 was deliberate, and it
> avoids repeating a defect the ledger already carries: `healTitle` protects
> the stored title of any session that has run, so a planning session that
> renumbers its own plan registers under the *outgoing* title and keeps it
> forever. That is why the ledger's row for session 65 reads "The half of
> the trial that needs a published router" when 65 was the papercuts — it
> registered before its own amendment landed. Session 67 will now register
> under the title the plan already declares. The 65 row is wrong on the
> record and is not hand-editable — `owed` has no `raise` verb, only `list`
> and `answer`, so nothing outside a session can file it. **Session 68
> records it as a decision**: whether a title frozen at registration should
> follow a plan the same session renumbered, or whether the record is right
> to keep what it stored and only the projection should say so.
>
> **Session 65 — the papercuts the csv-model trial found.** `windowsHide` on
> the two spawn paths in `checks.ts` (the console windows that stole the
> operator's cursor); the Dabbler terminal's band re-opened per physical
> line, so a stop carrying git's multi-line stderr no longer staircases; the
> teal band replaced by a neutral gray with per-event tones, and the verdict
> and test outcome read from `rounds.jsonl` and `test-runs.jsonl` rather
> than scraped from job bytes; `dabbler.terminalLocation` (default
> `editor`); `Dabbler: Show Framework Terminal`, with a closed terminal
> forgotten so it can be rebuilt; the land stop that said `fatal:` when a
> repository simply has no remote; `affected` no longer claiming no suite is
> declared when one is merely not `expensive`; the heredoc rule added to
> `SHARED_BODY` so bootstrapped projects get it; the `api-models.lock`
> warning given an owner (bootstrap says it once; `session start` never
> calls a vendor); and `start()` refusing to re-register an in-flight
> session under a contradicting identity — while an OMITTED field now
> carries the record forward instead of being erased, which is the bug the
> verifier caught in my own test.
>
> **Session 66 — the publish gap, CI, and the spinner.** CI had been red
> since before session 63 and the reason was not what it said: the
> repository declared no line endings, every text file is stored LF, and
> `core.autocrlf` is true on `windows-latest`, so a fresh clone wrote CRLF
> and all 31 generated modules compared unequal. `check:types` is the FIRST
> step of that job, so typecheck, lint, the 1218-test router suite and the
> bundles had not run at all in that time. One `.gitattributes` line fixes
> it; reproduced in a scratch clone before planning, and nothing was hiding
> behind it. `staleFiles` also now compares lines rather than the bytes
> between them, so the control can never again blame the schemas for a
> checkout setting. Then: a `publish` phase between `land` and `close` for a
> releasable session (it cannot go earlier — `packageSession` asks the close
> gates, and `working_tree_clean` and `pushed_to_remote` are false before
> the land); the `published_when_releasable` close gate, which packaging
> OMITS from its own preconditions because asking it of packaging by
> packaging refuses the first publication for not having happened;
> `secret` made optional for a feed that is a path on disk, failing safe on
> anything it cannot identify as local; the managed body's publishing claim
> made true and scoped to releasable sessions; `windowsHide` on the last
> four `spawnSync` sites via one `hiddenSpawn` in `journal.ts` (the only
> module low enough to hold it without a cycle); and the spinner — drawn
> only at column 0, so it can never sit on a runner's partial line and erase
> it, which is what the verifier caught.
>
> **Not yet active on the operator's machine.** `dist/` is gitignored, so a
> session always runs under the PREVIOUS build — session 66's own close ran
> six gates, not seven, and that is correct. The router was rebuilt after
> the close and now carries everything. **The extension is still 2.7.0 and
> predates both sessions**: the spinner, the tones, `terminalLocation` and
> Show Framework Terminal are inert until it is repackaged, installed with
> `--force` (same-version republish leaves seats stale) and the window
> reloaded.
>
> **Four framework defects found by walking into them; (1)–(3) are session
> 67 and (4) is session 68.**
> (1) `lastActivityAt` never reads the driver's run record, so
> `possiblyStalled` was `true` through two hours of productive work and
> would have looked identical during the forty minutes the engine actually
> was stopped — it cannot discriminate at all. (2) The driver stops in
> `verify` and re-runs it forever when `verify` reports the preverify
> evidence stale, instead of re-entering `preverify` as `phaseRunOfRecord`
> already does; this cost a full 24-file cycle and made the operator paste a
> command by hand. (3) The deadlock classifier compares the driver's own
> wrapper text, so two unrelated refusals were called a deadlock. (4)
> Repairs made during a stop belong to no step, so a report omits them and
> is refused — there is a real state (halted, being repaired) with no
> reporting edge out of it. (2) and (3) are one fix: the driver reading
> `verify`'s reason rather than only its exit code. (4) is session 68's
> rather than 67's because it is the harvest's own question 7 — a repair in
> a state with no edge to record it — and designing that edge twice is
> worse than designing it once with the critique in hand.
>
> **Test load is a live operator concern.** A 4-worker run of record made
> the host unusable mid-session and had to be killed; the run was redone at
> one worker via `CI=1` in the environment, which reaches vitest through the
> job runner and changes no tracked file. Session 67 lowers `WORKERS_LOCAL`
> to 2. Session 66 ran ~6 full-ish suites, only ONE of which was the run of
> record — the other five were preverify cycles forced by stops, which is
> why defect (2) is the bigger lever. Separately, the machine showed 4.35 GB
> of compressed memory and a live `TiWorker` (Windows Update) during the
> stall; the operator wants diagnostics later, and the tests may have been
> the straw rather than the load.
>
> **Open proposals, not scheduled.** (a) The run of record moves to CI, with
> a `run_of_record_green` close gate reading the CI conclusion — master
> receives the commit as usual, but the ledger never says `VERIFIED` until
> CI confirms. (b) The operator's extension of it: push a scratch branch for
> preverify too and observe the result, which defeats the "preverify gates
> verification, which precedes the push" objection. Both need CI's trigger
> widened beyond `master`, both are per-repository escape hatches rather
> than defaults, and `--shard` is what makes CI faster than local rather
> than slower. The write-up, with the accounting, is now in
> `docs/sessions/session-plan.md` under "Candidate: the run of record moves
> to CI", after session 70 — it was in a scratch directory and would have
> gone with it.
>
> **Running in parallel, outside this repository.** A logic-tree harvest:
> serialize the framework's decision machine and have `gpt-5-6-sol` and
> `gemini-3-1-pro` critique it for gaps proactively. Plan and the watcher
> specification are in `C:\temp\dabbler-logic-harvest\`, driven by a second
> engine beside this repository and read-only against it. **Session 68 is
> what receives it**, and that session — not the harvest — decides whether
> the model is adopted, and writes the control that holds it to the code if
> it is. It targets the state-machine gaps, not implementation slips — say
> so to anyone who expects it to replace preverify or the verifier.

> **Recorded, 2026-09-01, after session 64 — the deck exists.** Closed
> `VERIFIED` in two rounds. `docs/onboarding/dabbler-onboarding.pptx`,
> generated by `build-deck.mjs` (pptxgenjs), screenshots captured from
> the running 2.7.0 extension by `capture-screens.mjs` and — for the
> driving and stopping slides — `capture-walk.mjs`, which ran a real
> driven session on a scratch repository (`C:/temp/s64-walk`, absolute
> paths, the D251 rule held) and photographed the two terminals, the
> moving rows, the interrupt toast and the attention row live.
> `walk-notes.md` records what a person had to type in a fresh window —
> the folder-trust prompt and the CLI's first approval ask — and three
> observed quirks, noted as evidence for whichever session fixes them,
> none a stop. **The operator's open question is answered AS DESIGNED:**
> the four CSV repositories are declared rather than built, the Solution
> Explorer screenshot is real over the declared solution, and no slide
> is a mockup of a screen that does not exist. `verify-deck.mjs` is the
> session's one test — it opens the built deck, holds it to the build
> script's slide manifest, checks every screenshot is embedded, and
> enforces the two readability rules (every command copy-pasteable, no
> naked decision IDs) over extracted slide text. Round 1's Major (the
> central screenshot was staged by a separate automation rather than the
> documented Start path) was fixed and re-verified; four nits stand on
> the record. **The session-62 at-cap repair is now reviewed and
> confirmed**: three Starts in one window, each new CLI split beside the
> one Dabbler terminal, earlier CLIs standing alone — `walk-notes.md`
> carries the observed terminal table. The `REMEDIATED_AT_CAP` on 62's
> row keeps its honest verdict; the review it lacked is on this record.
>
> **65 is amended with the operator's one-version directive** (recorded
> 2026-08-31, after an install showed router 2.0.0 beside extension
> 2.7.0): the router stops carrying its own number and takes the
> extension's — one version, stamped from one source, read by
> `dabbler --version`, the ledger's `frameworkVersion` and both release
> tags; the release order (router before the extension) is unchanged,
> only the numbers merge. 65 remains the operator's to trigger: it runs
> when the decision to publish is taken, and not before.

> **Recorded, 2026-08-31, after session 63 — the escape route is built.**
> Closed `VERIFIED` in two rounds. What landed, from the session's own
> close-out: stops are **classified** — a stop on the same step with the
> same reasons twice running says `deadlock`, and a judge-produced reason
> cites its rule by name; the guide's "When the framework stops" section
> carries the **diagnosis protocol** (read the framework's account first;
> verify the claim against code; fix framework source in the tree on THIS
> repository — the 60/62 precedent — and report `blocked` with an owed
> item on a consumer repository, where dabbler is an installed package;
> never touch the records) with three pointer lines in the managed body,
> re-bootstrapped here; **`dabbler triage`** assembles a stop's artifacts
> and asks a provider that is not the working engine for a
> schema-validated classification with a minimal amendment; the
> **unattended ladder** runs second provider → third provider → an owed
> decision carrying the raw artifacts, no rung loops, every rung
> terminates at the human, and a gate-relaxing amendment is only ever a
> recorded human choice; **`session interrupt` queues against a stopped
> run** and the resume drains it as `sent: <text>`; **`session plan
> amend`** is the affordance 62 lacked, reason and approver on the
> record; and the **readers of driver records accept unknown properties**
> while writers stay strict — "Execution record unreadable" is reserved
> for damage, and the installed-extension schema skew class is dead.
> Round 1 raised two Majors, both telling: adviser routing failures
> **bypassed the ladder's human floor**, and triage amendments were
> discarded — the owed "Amend step" choice wasn't wired to `plan amend`;
> both fixed and re-verified in round 2 (two nits stand on the record:
> `stopArtifacts()` trims what "raw artifacts" promises, and the generated
> amendment command isn't directly executable as printed). Extension
> **2.7.0**, installed; unpublished like the rest. The deck (64) and the
> trial (65) stand as re-cut — the deck's walk still owes the review of
> 62's at-cap terminal repair.

> **Recorded, 2026-08-31, after session 62 — the entry is built, and the
> plan gains the escape route.** Session 62 closed **`REMEDIATED_AT_CAP`**
> at four rounds: round 1 (full) two Majors and two nits, rounds 2 and 3
> fix-delta each finding a terminal-placement Major, and the round-3
> repair — a cached split Dabbler terminal is now moved beside the CLI a
> later Start creates — landed at the cap **unreviewed**. The deck's walk
> (64) exercises exactly that workflow (several Starts in one window) and
> doubles as the review. What landed: the managed body says one thing —
> call `dabbler session next` and do what it says until `done` — and this
> repository's `AGENTS.md` is re-cut from it; **Start opens the person's
> own CLI** in a terminal at the root (opening sentence in argv where the
> CLI takes one), *Start Unattended Session* keeps headless `drive`, and
> Stop/Send survive only for extension-launched drives; the **Dabbler
> pseudoterminal** shows the framework's work and nothing else — phase
> lines, job logs byte-for-byte (the runners' colours and ✓ arrive whole),
> working/waiting indicator, the band, theme-aware — and carries **no
> engine chat, ever**; a **framework stop or owed decision is loud**: the
> attention row with the brief in its tooltip, the toast with the
> recommended option, the badge, the QuickPick whose items carry each
> option's consequence, answered through `owed answer` in-process; engine
> renders **strip CSI/OSC** so the colour bleed is dead code from the next
> build. Extension **2.6.0**, walked on a scratch repository from the
> installed build. Mid-session history worth keeping: the judge deadlock
> (step-files must-include vs the unchanged rule made `managed-body`
> unanswerable; fixed by the operator's direct order, outside the session,
> riding in its verified diff — and `session interrupt` proved to be
> refused against a stopped run, so there was no way to coach the resume),
> and a poll-timer leak in the new pseudoterminal that held the test
> process open, caught by the hanging suite and fixed with `unref` +
> `clearInterval` in the same remediation.
>
> **The re-cut: session 63 is the escape route; the deck is 64 and the
> trial 65.** Designed with the operator across the day's three stops:
> stops classified (`deadlock` = same step, same reasons, twice running;
> rules cited by name); the attended path as a diagnosis protocol in the
> guide with three pointer lines in the managed body (fix framework
> source in the tree on THIS repo — 60/62 precedent; `blocked` + an owed
> item on a consumer repo, where dabbler is an installed package); one
> `dabbler triage` verb both modes call (cross-provider, schema-validated
> classification with a minimal amendment); the unattended ladder with a
> floor (second provider, third provider, then an owed decision with the
> raw artifacts — no rung loops, every path ends at a human, and the
> framework never relaxes a gate on its own authority); a Send that
> queues against a stopped run; `plan amend` with reason and approver on
> the record; and the reader-tolerance fix for the installed-extension
> schema skew. The ledger heals at the next `session start`, as before.

> **Recorded, 2026-08-31, after session 61.** Session 61 — the pull —
> closed `VERIFIED` in three rounds, driven by `session drive` with Opus.
> What landed: **`dabbler session next`** advances the session one move
> per call and prints the instruction JSON as the only thing on stdout
> (`divertOut` sends every inner verb's chatter to stderr, so a parser
> reads clean JSON and a person still sees it all); `drive` and `next`
> are **one loop with the seam at `converse`** — push invokes the engine
> there, pull returns the outstanding instruction — same `advance`, same
> `judge`, same phases. The framework's long work (a verify round, the
> complete suite, the close) runs as a **detached job** (`jobs.ts`): the
> runner writes its exit to a status file by write-then-rename, the pid
> answers only "is anything still running", and a job with no process and
> no status is a **stop**, not a silent re-run — a machine that restarts
> mid-round does not spend a second round unrecorded. `next` answers a
> running job with `kind: wait` and `retry_after_seconds` — a tool call,
> not a sleep. **Resuming by recency is gone**: Claude Code takes
> `--resume <session_id>` from the first invocation's `init` event, Codex
> `exec resume <thread>` from `thread.started`, and the Copilot seat —
> which reports no conversation id at all — now runs **every invocation
> as a fresh conversation** carrying the instruction file's context and
> no other: a re-read is a price, the wrong conversation is a wrong
> answer. **D252**: `drive` stays as the unattended half (CI, overnight,
> the extension's Start today); retiring it would have deleted a measured
> capability and left Start with nothing to call. The guide is re-cut
> pull-first, `drive` one section at the end. Round 1 raised three
> Majors, all remediated (Copilot still resumed by recency; `next` lost
> `--max-rounds`/`--transport` between calls; a `rejected-thrice` stop
> re-judged the same answer and stopped again); rounds 2 and 3 were
> fix-delta `VERIFIED` with two nits on the record. No extension change;
> still 2.5.0.
>
> **Owed to 62, from the operator watching 61 run:** colour bleeds in a
> real terminal — a green ✓ (or red text) at a line's end stays on for
> the lines after. Diagnosed: the engine's tool results carry the test
> runners' ANSI, and `clip` in `engines.ts` truncates at a character
> count, which can cut a colour's reset off while keeping its opener;
> `clip` also collapses whitespace but strips no escapes. The renderers
> must strip CSI/OSC from engine-derived text before speaking it — in the
> terminal it bleeds, and in the "Dabbler: Engine" channel a raw escape
> would land inside the grammar's scopes as garbage. The Dabbler
> terminal's job-log passthrough (62, step 4) stays raw on purpose: there
> the runners' colours arrive whole, resets included. Also owed: the
> Start split — Start opens the person's CLI (the staff-facing default),
> a separate command keeps launching headless `drive`, and Stop/Send
> survive only for that. 62 is the extension session; it is on the plan.

> **Recorded, 2026-08-31, after session 60 — the first session this
> repository drove itself, and the plan re-cut for the pull.** Session 60
> closed `VERIFIED` in three rounds, driven end to end by `dabbler session
> drive` with Opus on Claude Code: plan accepted, four steps, eight
> invocations, verification with dispositions, run of record, commit,
> push, close. It stopped once — the engine reported step `prefix`
> `blocked` after finding a real bug in `spawnProgram`'s `.cmd` branch
> (`cmd /s` strips the first and last quote of the line, so a shim under
> `C:\Program Files` became `'C:\Program' is not recognized`; 58's shim
> test had no space in its path) — fixed it in `checks.ts` with a
> falsifying test, and said truthfully that the running bundle could not
> load the fix. The resume was one command from a terminal on the rebuilt
> `dist`, since Start and the PATH shim both run the installed bundle.
> Round 1 raised three findings (the driver loading configuration from
> the invoking repository rather than the driven one; the grammar missing
> the error scope on a blocking verdict; the guide's provenance claim),
> round 2 one Major and the nit, round 3 the nit only; the guide step was
> amended on the record in round 2 (not every example could come from the
> fresh walk, and the guide now says which walk each came from). What
> landed: `drive` → `dabbler` on every line the driver speaks; the
> "Dabbler: Engine" channel under a `dabbler-drive` language with a
> TextMate grammar on standard scopes; `docs/driving-a-session.md`
> re-cut; extension **2.5.0**, unpublished. The driven close writes
> `project-work-plan.md` and the change-log, not this file — this block
> is the operator-side record.
>
> **Two findings from the run, both on the plan now.** (1) `claude -p
> --continue` resumes the most recent conversation in the directory: after
> the resume, the driver's invocations 4–8 ran on top of an unrelated
> interactive Claude Code session that was newer (`engine-01..03.log`
> carry session `7a3a4490…`, `engine-04..08.log` another) and appended
> their turns to it. Any interactive session in the same directory
> hijacks a driven run; the fix is `--resume <id>` from the first `init`
> event (Codex: the thread id, never `resume --last`). (2) The colour, ✓
> and spinner the operator liked in the terminal were vitest and mocha on
> a real TTY through `test-evidence run`'s `stdio: "inherit"` — the router
> styles nothing. An Output channel can never show that; a terminal
> always will.
>
> **The direction: the engine stays in the person's own CLI.** The
> operator's adoption call: the staff trust the Copilot CLI and Claude
> Code as they are, rejected an earlier extension for doing too much, and
> would read a driven session that replaces their CLI with an Output
> channel as a home-made CLI worse than Copilot's. So the framework goes
> to the background as a **pull** — no driver process; `dabbler session
> next` advances the state machine on disk each call and returns the next
> instruction, long work backgrounded with `kind: wait` — and the engine
> is the person's interactive session, with its own spinner, chat, ask-user
> and Esc. It is not the spike's *await*: nothing waits and nothing can be
> orphaned. **Sessions 61 and 62 are that work** (61 the verb, the
> background jobs, `drive` over `next` or retired, resume-by-id if kept,
> the guide; 62 the entry — the managed body reduced to one sentence,
> Start opens the CLI in a terminal, a *Dabbler* pseudoterminal for the
> framework's work with the runners' output passing through, loud stops
> as attention rows, toasts, the badge, answered from a QuickPick);
> **the deck is 63 and the publication trial 64.** The ledger was not
> hand-edited: 61 and 62 were historyless rows, the projection heals
> titles on read, and the next `session start` grows the ledger to 64.
> Start on 61 from the installed 2.5.0, or the terminal command in
> `docs/driving-a-session.md`, is how it begins — and 61 changes the
> driver, so expect the same rebuild-and-resume from `dist` if it stops.

> **Recorded, 2026-08-31, after session 59: the plan is re-cut once more.**
> Watching the first driven sessions in "Dabbler: Engine" showed one
> block of default-coloured text, the driver's lines and the engine's
> told apart only by the `│`. Three surfaces were weighed — a
> LogOutputChannel (level colours and a filter; a doubled clock, no
> palette), a language and TextMate grammar on the existing channel
> (every line class coloured through the theme's own scopes; no
> background, no router change), and a Pseudoterminal (full ANSI, a
> background band on the engine block, a typed Send) — and the operator
> chose the grammar now, with the band (#165044 dark / #87decd light, on
> the engine block only) deferred until a few drives have been watched
> under it. The prefix `drive` becomes `dabbler`: the operator weighed
> `📢` and `ⓓ` and took the word — typeable, greppable, one width in
> every font, and a dimmed word costs nothing once the grammar lands.
> **Session 60 is that work**, inserted after 59; **the deck is 61 and
> the publication trial 62.** The ledger was not hand-edited: 60 and 61
> are historyless rows, so the next `session start` re-titles them from
> the plan's headings and grows the ledger to 62 (`buildSessionsArray`
> in `writers.ts`, `healTitle` in `progress.ts`), and the projection
> heals titles on read, so `dabbler status` and the Work Explorer already
> show the new names on 60, 61 and 62. **The deck (61)
> knows:** its screenshots of the channel are taken after 60 lands,
> never from 59's plain block; its example lines carry the `dabbler`
> prefix; and it gets a slide between 6 and 7 for driving a session.
> **Owed to 60:** the walk the verifier keeps asking for — Start pressed
> from the installed extension — is 60's as much as 61's, and
> `docs/driving-a-session.md`'s line-kind list should say `engine:`
> (what `engines.ts` prints for the engine's words), not `text`.

> **Recorded, 2026-08-31, after session 59.** Session 59 — the last of the
> driver set — closed `VERIFIED` in two rounds. Round 1 raised two
> Majors: one was fair and is built (a Send made while no invocation was
> running was discarded at the next boundary while the extension said
> "Sent" — the driver now **defers** it and the next instruction carries
> it first among its `reasons` as `sent: <text>`, including the race
> where the poll takes a request as the engine exits on its own; a Stop
> halts wherever it is next seen); the other ("child process despite the
> in-process requirement") was **disputed with line-cited evidence and
> withdrawn** in round 2, because D251 had recorded the amendment and its
> three reasons before the round. Its deliverable is **D251**: **Start is
> the launch.** The Work Explorer's Start Session picks the engine (and
> the model: optional for Claude Code and Codex, required for a Copilot
> seat and refused by name before anything spawns) and runs `dabbler
> session drive` — as a **child process of the extension host** on the
> editor's own Node, the same bundled `dabbler.cjs` the terminal shim
> runs, through the router's own `spawnProgram`/`terminateTree` (now
> exported for exactly this caller). The plan's word "in-process" was
> **amended with evidence**: `standIn` holds one root and throws for a
> second caller, the in-process router serialises verbs, and `capture`
> buffers a verb's output until it returns — a drive is one verb that
> lasts the session, and in-process it would have queued Stop behind
> itself and shown its output at the end. Everything the driver prints
> lands live in the **"Dabbler: Engine"** output channel; the task rows
> move by themselves; the status bar shows **Stop** and **Send to
> engine** while a drive runs (also on the palette under
> `dabbler.driving`). **Stop needed `--stop`**: a plain interrupt
> re-invokes the engine, so `session interrupt --stop` is new — the driver
> ends the invocation and halts with `interrupted` on `run.json` (a ninth
> stop kind, with the person's reason); the session stays in flight and
> the same Start resumes; a stop that arrives between invocations is
> honoured at the next boundary. **Send** is the plain interrupt. The
> copy-prompt commands (Start the next session, Run Prompt, Send Back,
> Respecify, the left-click clipboard half, the Copy Prompt submenu) are
> **gone**: the framework sends, nobody pastes.
> **`docs/driving-a-session.md`** is the developer's guide, linked from
> README and quick-start, its examples copied from a real walk.
> **Walked live** with Haiku on Claude Code on a scratch repository
> through the exact command line the extension launches: two plan
> refusals (Haiku *printed* the answer command instead of running it —
> `enginePrompt` now says "RUN the shell command … printing it is not
> [the answer]", and a third walk had the plan accepted on the first
> invocation), a stale-seq refusal from the report verb that Haiku fixed
> itself, a Send mid-step honoured (one-line `greet`, no JSDoc, as told),
> `check-passed`, `report-accepted`, then Stop landing as `interrupted`
> with the Work row reading `Driver stopped (interrupted): …`. The press
> of the button itself is the operator's (the verifier's standing nit):
> extension **2.4.0** is built and installed here, unpublished like
> 2.0.0–2.3.0. Six extension tests, two router tests; **1181 router
> tests**, 148 extension tests.
>
> **An incident, on the record (D251).** A `git checkout -- .` and `rm -rf
> .dabbler …` meant for the scratch repository ran in this repository
> (the chain began with `cd` here): every uncommitted edit was reverted
> and **this machine's untracked `.dabbler/` — the round records, test-run
> rows and driver ledgers of sessions 22–58 — was deleted and is not in
> git.** Tracked state and history were restored from HEAD, the session
> was re-registered and re-declared on a clean tree with the same task
> file, and every edit was redone from the session's own record; nothing
> under the tracked tree was lost. A second, smaller misfire launched a
> `session drive` in this repository (one read-only plan invocation,
> stopped; `.dabbler/runs/s59/driver/run.json` says so). The rule is now
> in memory and in D251: destructive commands for a scratch checkout run
> in their own command with absolute paths, never after a `cd` here, and
> every walk verb carries `--sessions-dir`. **The operator should know**
> that the Work Explorer's verification detail for sessions 22–58 on this
> machine is gone (the work computer's ledger is separate; the round refs
> pushed under `refs/dabbler/rounds/` by each close survive on the
> remote); the closes that consumed that evidence are unaffected.
>
> **Owed to 64, the deck (60, 61, then 63, across the re-cuts above).**
> The deck shows the driven lifecycle as 61–63 reshape it; its walk's
> several Starts in one window review 62's at-cap terminal repair; and
> pressing Start on the next session from the installed extension is the
> walk the verifier still wants. **Left
> open:** 58's nit stands, narrower — `run.json` does not say whether an
> invocation is in flight, though nothing sent is lost any more. The
> interrupted invocations in the walk ended by the ten-second tree-kill
> fallback as often as by Claude Code's control message (`exit=1
> seconds=10`) — measure why before the deck promises "gentle".

> **Recorded, 2026-08-31, after session 58.** Session 58 — the third of the
> driver set — closed `VERIFIED` in two rounds. Round 1 raised two Majors:
> one was fair and is built (engine children had no POSIX process group, so
> a tree kill would have orphaned the tool the engine was running — the
> `detached` rule now lives inside `spawnProgram` for every caller, proven
> by a test that kills a real grandchild); the other asked for the plan's
> `text`/`-s`-when-quiet argv and was **disputed with line-cited evidence
> and withdrawn** in round 2, because D250 had already recorded that the
> plan's step 4 ("identical bytes on the ledger") forbids it. Its deliverable is
> **D250**: the engine adapter. **One spawn**, `checks.spawnProgram`: an
> `.exe` with no shell, a `.cmd` shim through `cmd.exe` with every argument
> quoted, and the declared checks, the Copilot seat and the engines all go
> through it — both branches proven with a real shim in the suite. **Three
> argv shapes, measured** off the installed CLIs' `--help` (`engines.ts`):
> Claude Code `-p --input-format stream-json --output-format stream-json
> --verbose --dangerously-skip-permissions [--model] [--continue]` with the
> prompt as a stdin user message; Copilot `-p <prompt> --model M
> --allow-all-tools --allow-all-paths --no-ask-user [--continue]` (model
> required, refused by name without it); Codex 0.151.0 `exec --json [-m]
> --dangerously-bypass-approvals-and-sandbox <prompt>`, then `exec resume
> --last …` (cwd-scoped). `--engine-argv` is now optional and overrides;
> gemini has no shape and is refused by name. **`driver.engine_output:
> stream | quiet`** (`dabbler.yaml`; `--show-engine` overrides one run)
> decides what the terminal shows and never what `engine-<NN>.log`
> records — the plan's `text`/`-s` when quiet was dropped because it
> contradicted the plan's own "identical bytes on the ledger"; `stream`
> shows Claude's thinking / tool / text / result lines and only the `init`
> system event, Copilot's own lines, Codex's completed JSONL items. **The
> interrupt, one path:** `dabbler session interrupt --reason "<text>"`
> writes `interrupt.json` (refused when nothing is being driven; cleared at
> registration); the driver polls it every half second, ends the
> invocation, writes `# interrupted (<reason>)` on the transcript, and
> re-issues the same instruction as `kind: interrupt` under a new seq with
> the reason first among `reasons`, then re-invokes with `--continue`.
> **Measured:** Claude Code's single-process variant honours a
> `control_request{interrupt}` on stream-json stdin — `control_response`,
> `result: error_during_execution`, process alive, context kept (it knew it
> had reached 4) — so the Claude Code adapter ends an invocation through
> that message and closes stdin at the `result`; Copilot and Codex get a
> tree kill, which is also the fallback ten seconds after a control message
> that ended nothing. `session.interrupt` is on the in-process contract for
> 59's Stop. Every `engine-invoked` line reports `invocation=N/max`. 57's
> `done` question: no CLI is invoked to read it, on any engine. Eight
> tests; **1179 router tests**; the extension changed only where its test
> stub implements the widened contract.
> **Round 2's nit, left because the tree was verified:** `session interrupt`
> cannot tell whether an invocation is running — a request made between
> invocations succeeds and is then discarded (logged as
> `interrupt-discarded`), and one written in the instant between the
> driver's discard and the spawn still ends the new invocation. Closing it
> means `run.json` saying an invocation is in flight, which is a schema
> change for 59 to take if Stop needs the truth rather than the log.
>
> **Owed to 59.** Start becomes the launch: `session drive` with the
> registered engine and no `--engine-argv`; Stop and Send are `session
> interrupt`; the attention row exists already. The developer's guide
> documents the driven lifecycle, `driver.engine_output`, the interrupt,
> and what a stopped loop looks like. **Noted.** The Codex renderer follows
> Codex's documented JSONL item shapes; the CLI is not installed here and
> its output was not measured live — the first driven Codex session should
> read its transcript against the rendered lines.

> **Recorded, 2026-08-31, after session 57.** Session 57 — the second of the
> driver set — closed `VERIFIED` in two rounds. Round 1 raised three Majors:
> one was fair and is built (a stopped loop is now an **attention row** —
> `buildTaskRows` reads `run.json` and blocks the first phase not done with
> the stop's kind and reason); two were disputed with line-cited evidence
> and **withdrawn** in round 2 (the verb holds a disposition set against the
> round *before* writing, so an incomplete set never reaches disk — now a
> test case; and `driver.max_invocations` is snake_case like every key in
> `dabbler.yaml`, the D248 precedent). Its deliverable is **D249**: **`dabbler
> session drive`**, the loop in `packages/router/src/drive.ts` that runs a
> session from registration to close by calling the lifecycle's own verbs
> — `session start`, `session declare` from the engine's plan, `test-evidence
> run` for the affected tests and the run of record, `verify`, `verify
> dispute` for a rejected finding, one commit and one push, `session close`
> — so a driven session leaves exactly the record a typed one leaves and the
> task rows move for the same reasons. Every report is judged in one place
> (seq, step, files exactly what the tree changed since the last accepted
> step, the step's `argv` checks green through the controls' executor) and
> refused with every reason; three refusals stop the loop. Blocking findings
> go back as a `rejection` carrying every finding; a `fix` becomes a
> `fix-round-N` step checked by every plan step's check, a `reject` becomes
> a dispute; red affected tests and a red run of record go back the same
> way. The plan and the dispositions travel through **`session report
> --answer-file`** (56's owed item 1): the verb stamps the framework's
> members, refuses one the engine typed differently, and refuses a file
> inside the ledger. **`driver.max_invocations`** in `dabbler.yaml` (snake_case;
> repository-owned; default 24) bounds the engine; a stopped loop closes
> nothing, writes why to the ledger's fifth file **`run.json`** (`driver-run`:
> phase, accepted steps, baseline tree, counters, `stop`), and the same
> command re-runs from the phase it reached — a different engine name is
> refused. One adapter ships: `commandEngine(argv)`, spawned per instruction
> with no shell, `{instruction}` substituted; **`--engine-argv` is required
> on the CLI until 58** adds the built-in argv per engine. Nine tests, a
> scripted engine in-process against the offline verifier. 56's owed nit (2)
> is taken (`[\s\S]*` in the path patterns). No extension change.
> **A lesson bought by the first run of record, which was red:** the drive
> tests each run a whole session (5–8 s alone) and vitest's default test
> timeout is 5 s; under the four-worker full suite three of them timed out,
> and a timed-out drive keeps running against a torn-down config. The
> `describe` now carries `{ timeout: 120_000 }`; a third round verified the
> change and the run of record was taken again. A test that spawns real
> work needs its own bound, and the bound is not a sign the work is slow.
>
> **Owed to 58.** The adapter proper: `resolveProgram` preferring an `.exe`,
> the quoted `.cmd` branch, the three argv shapes, `--continue` from
> `EngineInvocation.first`, stream/quiet with the stream-json renderer over
> `emit`, and the interrupt. **For 59.** The attention row already exists in
> the task rows (blocked, "Driver stopped (kind): reason"); Start becoming
> the launch needs no new projection field for it. **Noted.** A driven session's `done`
> instruction is written but the engine is not invoked to read it — on a
> seat that is a premium request that buys nothing; 58 decides whether a
> CLI needs the closing turn.

> **Recorded, 2026-08-31, after session 56.** Session 56 — the first of the
> driver set — closed `VERIFIED` in two rounds. Its deliverable is **D248**:
> the driver's contract. Four schemas under `packages/router/schemas/` with
> generated types — `driver-instruction` (`seq`, `kind` ∈ step | rejection
> | interrupt | done, per-kind required members, `answer_schema` +
> `answer_command` on every kind but `done`, refused on `done`),
> `driver-report` (`status` ∈ done | blocked, repository-relative
> `files_changed`, `tests_run`, `notes`), `driver-work-plan` (`task`,
> `releasable`, ordered steps with unique ids, expected files and **at least
> one** `argv` check each) and `driver-disposition` (per finding `fix` |
> `reject`; a reject carries `reason` and `evidence_paths` so it can become
> a dispute; the reader **holds the set against the recorded round** and
> refuses a repeated index, an index the round lacks, or a blocking finding
> left unanswered). Round 1 bought both bolded tightenings: the verifier's
> two Majors were `checks: []` closing a step on the engine's word, and a
> disposition set that could omit a finding. The driver's ledger is
> `.dabbler/runs/s<N>/driver/` — `instruction.json`, `report.json`,
> `plan.json`, `dispositions.json`, `engine-<NN>.log` per invocation —
> owned by the new `driver.ts`: whole-file, atomic, the CURRENT answer, and
> a `LedgerError` on read when a file does not validate.
> **`dabbler session report`** (`--seq --step --status --files --notes
> [--tests]`) is the engine's one verb: it normalises paths, shapes,
> validates and writes; it refuses a report no instruction asked for and
> one where the instruction asked for a different answer; it judges shape
> only. Substance — the outstanding seq, the step asked for, the files the
> tree changed, the check — is session 57's driver, in one place. Field
> names are snake_case (not the spike's camelCase) to match the ledger's
> neighbours. Seven tests; **1162 router tests**. No extension change.
>
> **Owed to 57.** (1) How the work plan and the dispositions travel from
> the engine into the ledger — the report verb carries a step report only,
> so 57 widens the verb (an `--answer-file` it validates and copies) or
> adds a sibling; `answer_command` on the instruction is whatever line 57
> picks. (2) Round 2's nit, left because the tree was verified: the path
> pattern's `.*` does not span a literal newline, so `src\n/../widget.py`
> passes the `..` lookahead — use `[\s\S]*` when the schema is next
> touched. (3) A lesson for every session, not just this one: the
> `extension` suite's `final-full` binds to the **whole** tree, so it must
> be run and recorded each session even when no extension file changed —
> the close refused once here for exactly that.

> **Recorded, 2026-08-31, evening.** The long-haul direction below was
> **proven the same day** in a standalone spike (`D:\Projects\dabbler-driver-spike`):
> a scripted five-step session driven by the framework, with Haiku on Claude
> Code and Luna on the Copilot seat, in an *await* variant (the engine blocks
> on a signal file) and a *resume* variant (the driver invokes the engine per
> step with `--continue`). All four trials passed with no human nudge; one
> seat session per Copilot run; ~5 premium requests per driven run. The
> operator chose **resume**, saw the engine's live output preserved
> (`--engine-output stream|quiet`, identical transcripts), and agreed the
> interrupt is the driver ending the invocation and re-invoking with
> `--continue` and the reason. **The plan is reordered:** sessions **56–59**
> are the driver set (schemas and the report verb; `session drive`; the
> engine adapter with stream and interrupt; Start becomes the launch plus the
> developer's guide), the deck is **60** and the publication trial **61**. The
> spike found two things worth carrying: an engine CLI must be spawned as an
> `.exe` with no shell or with quoted arguments for a `.cmd` shim, and only
> Claude Code's `init` system event is worth showing.

> **Recorded, 2026-08-31, latest.** Session 55 was inserted from the
> operator's screenshot of session 54 and closed `VERIFIED` in one round.
> Its deliverable is **D247**: the Work Explorer's task rows are **derived
> from the lifecycle's own records** — *Register* from `startedAt`,
> *Declare* from the declaration, *Work* from the pre-verify evidence,
> *Verify* from the rounds ledger, *Run of record* from the `final-full`
> row, *Close* from the status — and the seeding, the two bookends and
> `dabbler session log` (CLI, in-process router, contract) are **deleted**.
> Nothing an engine types moves a row; the open row is the first not done.
> `test-evidence record` now stamps the session on the row. Proven on the
> session's own rows before its verdict. The plan was renumbered: the deck
> is **56**, the publication trial **57**. Extension **2.3.0** is built and
> installed here, unpublished like 2.0.0–2.2.0; 1155 router tests.
>
> **The operator's long-haul direction, recorded for the block after 57.**
> The framework drives the lifecycle and calls AI as a service: an engine
> asked to "start the next session" resolves it and launches the framework;
> the framework asks the authoring AI for a work plan, hands back each step,
> calls the verifier (which `dabbler verify` already does, with a schema-
> validated round), routes findings back for disposition, runs the suite,
> and closes. Every answer the framework acts on is **structured against a
> schema** and refused mechanically when it does not validate; prose the AI
> writes (decisions, change log, close-out) is markdown for people and the
> framework never interprets it; code and tests the framework compiles and
> runs but never reads. `dabbler workflow` (session 35) is the seam to grow.
> Plan it as a set: the ask/answer schemas first, then the driver, then an
> authoring adapter per engine, then the extension's Start becomes the
> launch. Two cautions to decide up front: per-step calls need the prior
> step reports, not the transcript, or later steps degrade; and a verifier
> that writes tests against its own findings needs the authored-tests
> envelope kept.

> **Recorded, 2026-08-31, later.** Session 54 closed `VERIFIED` in one
> round. Its deliverable is **D246**: `packages/router/vitest.config.ts`
> caps the suite at **four workers locally and one in CI** (both bounds —
> vitest defaults the minimum to the core count). Measured whole-suite on
> the twenty-core host: 20 workers 94 s wall for 873 s of test time, 4
> workers 106 s for 352 s, 2 workers 138 s for 262 s; twenty was
> contention, and four costs twelve seconds while leaving sixteen cores
> free. The suite command in `dabbler.yaml` did not change. `config.test.ts`
> is now hermetic against `DABBLER_TRANSPORT` — the clear-and-restore sits
> at file scope, because four of its blocks resolve the transport, not one.
> The run of record was taken with the variable set in the shell.
>
> **Found while running it, not built: the Work Explorer's task rows are
> narration.** `session start` registers the session and leaves its own
> *Register* row in progress until an engine types `dabbler session log`;
> the *Affected* row waits for the same even though `affected` and
> `test-evidence record` run inside the framework; the step keys truncate
> at the first `.`, so "Make `config.test.ts` hermetic" rendered as *Make
> config*. The declare bookend opens one row and deliberately moves nothing
> else (`session.ts`, `advanceStepsAtDeclare`: a verifier upheld that the
> middle belongs to `session log`). The operator's reading, from the
> screenshot: confusing, and the same thing that never worked before. The
> proposal is in the section below, and it is the operator's to take.

> **Recorded, 2026-08-31.** Session 53 was inserted ahead of the publication
> trial from three pieces of operator feedback, and closed `VERIFIED` in one
> round. Later the same day the plan was reordered so the trial is **last
> (56)**: 54 caps the router suite's workers, 55 is the operator onboarding
> deck, and the trial runs when the operator decides to publish. Until the
> next `session start`, the ledger's row 54 still carries the trial's old
> title; `session start` re-syncs titles from the plan. Its deliverable is **D245**, which
> supersedes D104: the Work Explorer groups sessions under status buckets
> again — In Progress and Not Started ascending, Complete and Cancelled
> descending, empty buckets not rendered, counts dimmed on the headers, In
> Progress expanded and the rest collapsed, a close date on every finished
> row. Closed sessions that stopped at the cap are no longer attention rows;
> they sit under a collapsed *Information* bucket. The scaffolded session 1,
> `PLAN_PROMPT`, the bootstrap hand-off line and the extension walkthrough
> now tell the engine to **ask the operator what the project is** instead of
> guessing it from the folder (an engine did exactly that on a fresh
> project). `solution.yaml` declares this repository a one-component
> solution, so the Solution Explorer renders here. Extension **2.2.0**, built
> and unpublished like 2.0.0 and 2.1.0 before it.
>
> Two things noted and not built. (1) `packages/router/test/config.test.ts`
> is not hermetic against `DABBLER_TRANSPORT`: with the variable set in the
> shell, three `resolveTransport` tests fail; the run of record was taken
> with it cleared for the process. Clear it before the suite, or fix the
> test to. (2) The operator floated an Information bucket that also lists
> work done outside any session; nothing records such work today, so it
> needs a data source before it needs a row.

> **Recorded, 2026-08-30.** Session 38's deliverable is the planned-session
> projection; it recorded no decisions, and its three lessons are in the
> section below. Session 37's deliverables are decisions
> **D240–D243** in `docs/sessions/decisions-log.md`, and its survey is
> `docs/extension-dx-survey.md`. Three of the four were found by *running*
> the session rather than by planning it, and each one changes a later
> session: D240 (session 40's premise), D242 (session 39 owes the extension
> suite before session 41), D243 (the suite is not hermetic).

> **Recorded, 2026-08-29.** Session 36's deliverables are decisions
> **D231–D238**; session 35's are **D224–D230**;
> session 34's are
> **D218–D223**; session 33's are
> **D210–D217** in `docs/sessions/decisions-log.md`; session 32's are
> **D204–D209**; session 31's are
> **D197–D203**; session 30's are
> **D190–D196**; session 29's are
> **D187–D189**; session 28's are
> **D180–D186**, session 27's **D173–D179**, session 26's **D170–D172**,
> session 25's **D163–D169**, session 24's **D150–D162** and session 23's
> **D138–D149**, plus the amendments inside
> `docs/ts-port-parity-control.md`. This file summarises them; the decisions
> are the record.

> **How to read a session number below this line.** Session 29 was inserted
> between 28 and what was then 29, so the port's remaining sessions each
> moved up one and the plan ran to **36** (D188). Live guidance was
> renumbered; the append-only decisions log and the older sections of this
> file were **not**, because they were true when written. So "ported in
> session 29" in anything written before 2026-08-29 means what is now
> session 30, "session 31" means 32, and so on to the cutover, which was 35
> and is now 36.

## What is waiting on you

**Nothing that blocks work.** The next sessions run from the `.vsix`.
**Taken, 2026-08-31, as sessions 55–57 (D247–D249).** The task rows move
themselves; the driver has its contract (56) and its loop (57). **Next is 58,
the engine adapter**, then 59 (Start becomes the launch); then **60, the onboarding deck** —
install the current `.vsix` first on a fresh machine — and **61, the
publication trial**, when you publish.


One decision is open, and it is yours to take when testing is finished,
not before: whether to publish `dabbler-ai-router` to npm and the extension
to the Marketplace.

    dabbler owed list          # read the brief
    dabbler owed answer --id publication --choice publish   # when you are ready

The extension bundles the router and calls it in-process, and the `dabbler`
command in a VS Code terminal is the extension's own shim, so nothing you
are testing waits on npm: session 53 ran on an unpublished router, and
`tools/dabbler-ai-orchestration/dabbler-ai-orchestration-2.2.0.vsix` installs
with `code --install-extension`. What a publish buys is people who are not
you, outside VS Code — a Codex or Copilot CLI user in a plain terminal, and
a consumer repository's pre-commit hook run from one — and it buys session
56, whose `dabbler release --verify-install` can only ask the public
registry.

Publishing is the one act here that cannot be taken back — npm refuses
`unpublish` after 72 hours and a Marketplace version slot is never reusable —
which is exactly why it waits for the end of testing rather than the start.
When you do publish, it is router first and then the extension, at whatever
version is current then; the brief's `publish` answer does both in that
order and you run no git command. Earlier text in this file and in the
brief called this "the one thing waiting on you"; that framing came from
how sessions 49–50 phrased the acceptance criterion, and it overstated the
case.

## Where things are

**53 of 56 closed.** Sessions 37–50 were the DX block; 51 was the bounded
remediation the field trial mandated; 52 walked the startup experience; 53
brought the Work Explorer's buckets back and made session 1 ask. Next: 54
caps the router suite's workers, 55 is the operator onboarding deck, 56 is
the publication half of the trial and runs when you publish. The trial's full
record is `docs/field-trial-50.md`.

**Eight of `csv-model`'s nine feedback items are closed, with the code that
closed each one named.** The ninth is the publication decision above.

### What the block built

- **Sessions 37–40 — the operator's own surfaces.** A survey of 24 extension
  files (`docs/extension-dx-survey.md`, 13 findings); planned sessions
  projected so a repository stops reading as finished; owed decisions as a
  record with a class, a severity and a brief; task rows rendering at last,
  folded from the `plan-step` rows `session start` has always written.
- **Sessions 41–43 — setup, naming, liveness.** The icons that rendered with a
  line through them (`width="16mm"`); setup that creates the folder and runs
  `git init` itself; the pane renamed "AI Orchestration" with Solution and
  Work Explorers under it; an attention view over what is stalled and what is
  owed.
- **Sessions 44–48 — the multi-repository half.** `solution-dependencies.json`
  carries the edge and never the pin; the graph is the union of what every
  reachable repository declares, with `usedBy` derived; source-mode switching
  that makes git submodules unnecessary and refuses to let its evidence count;
  packaging detected and written for you; the Solution Explorer rendering and
  navigating the whole solution; one VS Code window over all of it.
- **Session 49 — the release path**, which is the section above.
- **Sessions 50–51 — the trial, and what it found.**

### Three sessions closed `REMEDIATED_AT_CAP`

44 and 45 hit the round cap; their final repairs are unreviewed code. 46
through 51 all closed `VERIFIED`, five of them inside two rounds. The
verification loop was not gentle and it was right more often than I was: a
dispute in session 40 was upheld against me, session 45's fourth round caught
that a self-reported test duration cannot prove when a run happened, and
session 48's first round caught a workspace generator whose paths would have
resolved into the wrong directory on its only path.

### Two things the trial found in what you read

Both fixed. `raiseOwed` was idempotent on a decision's *id*, so a brief
corrected in code never replaced the one on disk — live, and it would have
had you reading a recommendation the code had since reversed. And
`test-evidence --help` documented only `record`, omitting the framework-timed
`run` that a session now needs.

A third finding, F-50-4, was withdrawn in session 51: I had misread
`dabbler status` during the trial, printing its top-level keys and concluding
that fields nested under `repository` were missing.

### Still current, written at session 40

**Task rows render for the first time** — the Work Explorer's
third level has been built and unexercised since the port, and the reason was
not a missing feature.

**Session 40 closed `REMEDIATED_AT_CAP`, the second in a row.** The round-3
repair is unreviewed code: `declare` opening only step 1, and `start` no
longer logging the register step. Session 41 should read that before building
on it.

- **The plan was wrong and was amended before any code was written.** D240 was
  right: `dabbler session start` has always seeded a session's steps into
  `activity-log.json` — one `plan-step` row per numbered step, with a stable
  key — and `session log` moves them. `buildTaskRows` folded
  `approved-plan.json` against `step-execution.jsonl` instead, and nothing in
  the lifecycle writes either. **Two mechanisms for one purpose, and the tree
  read the one nobody wrote.** The planned task-file schema and `session step`
  verb were withdrawn on the record; the estimate went from 18 tests to 10.
- **The framework owns two bookends and no more.** `declare` opens the first
  step; recording the run of record closes the last. Everything between is
  `session log`, which already exists, already refuses a step it cannot
  resolve, and already journals.
- **`approved-plan.json` keeps its own job** — envelope, risk flags, amendment
  ledger for verification scope — and stops being the tree's source. The
  `ApprovedPlanReader` seam that reached it is retired.
- **D244:** `session start` no longer logs the register step. It used to write
  it complete, on the reasoning that the call IS the register step and the
  machine should record what it did — principle (g), and right in general. But
  a step `start` has moved is a step `declare` cannot open. Registration is
  still recorded in `sessions.json`, which is where a reader looks for it.

> **A dispute was filed and UPHELD against it, and the adjudication is the
> thing to carry.** `declare` had been completing step 1 and opening step 2,
> because step 1 reads "Register; declare" and is genuinely finished once
> declare returns. The verifier's answer: *semantic desirability cannot
> override an explicit transition requirement — if the requirement is
> undesirable, amend the plan rather than implement a different state machine
> quietly.* This session had already amended its plan once and then built
> something its own amended text did not describe, which is a unilateral
> substitution. Session 36 learned the same thing and it did not transfer.
>
> **The dispute also cost the round that would have reviewed the fix.** Filing
> it changed no code, so round 3's delta-only review had nothing to look at
> and re-raised three nits that round 2 had already confirmed resolved. Two
> sessions have now landed unreviewed in a row.

**Two sessions at the cap is worth the operator's attention.** The cap is
repository policy (`verificationRoundCap`), not a session's to change, and
nothing here suggests changing it — but sessions 39 and 40 both spent rounds
on the same shape of mistake: defending an interpretation instead of either
delivering the stated requirement or amending it first.

## Where things were at session 39

**Session 39 closed `REMEDIATED_AT_CAP`, not `VERIFIED`, and that is the first
thing to know about it.** Four rounds; round 3's repair was made and the cap
left it unreviewed. Every gate passes and `verification_clean` says so out
loud: *no verifier saw the repair.* It is not a waiver — nothing was accepted
over a standing finding — but **the round-3 delta is unreviewed code and
session 40 should read it first.** That delta is: `state` and `severity`
persisted on every owed-decision row, and the YAML list-indentation fix in
`appendSuitesToProjectConfig`.

- **Verification stops claiming things it did not check.** `checkTestRunFresh`
  returned a pass whenever no declared suite was expensive, which is how
  csv-model closed session 1 at a clean 5/5 with nothing runnable. A gate that
  cannot see its own precondition now reports **SKIP**, and a **sixth gate**,
  `owed_decisions`, does the refusing. Two rules that read as a contradiction
  are ordered as the rubric already orders them: nothing blocks on a person for
  a *judgment call*, and verification reduction is not a judgment call. Work
  runs to the end; what stops is the record calling itself verified.
- **`.dabbler/runs/owed-decisions.jsonl` is the new record**, append-only and
  repository-scoped because an unanswered question outlives the session that
  raised it. `dabbler owed list` prints the brief; `dabbler owed answer`
  settles one and **the framework writes the file** — for the suite question it
  writes `testing.suites` itself. Severity is derived from the class and never
  settable per call.
- **D242 is closed.** The extension is a declared suite (`runs_whole`: the npm
  script's glob is baked in, so naming a file would *add* to it). `dabbler.yaml`
  was also mapped to nothing and fell through to the smoke test while being the
  file that declares the suites; it is `repo_wide` now.
- Also: `--help` works after a subcommand on `session` and `test-evidence`, with
  a real per-subcommand options table; the malformed-suite message names
  `dabbler.yaml`; and a `none-selected` evidence outcome the framework
  **verifies by re-running the selection** rather than trusting.

> **The lesson of this session is about the second and third rounds, not the
> first.** Round 1's four Majors were all real and all cheaply fixed. Rounds 2
> and 3 were the same finding twice, and both times the defence was an
> interpretation rather than a delivery. Round 2: refusing to touch an existing
> suites list looked like a safe refusal and was a **deadlock** — the blocking
> question could be raised and never answered through the framework. Round 3:
> the record should carry `state` and `severity` on its rows, which this
> session's own plan says in plain words; two rounds were spent arguing that a
> state token does not belong in an event log. The design argument was
> reasonable and it was not the point. **Two of four rounds bought nothing but
> a concession that should have been made in round 2, and that is what spent
> the cap.**

**Owed to session 40 (D240, still standing):** `session start` already seeds a
session's plan steps and `session log` ticks them; what is missing is the join
to the projection the tree renders. Session 40 must re-derive its approach from
both mechanisms before writing code — it is likely much cheaper than planned.

**Both suites are now measured.** A session that changes only `tools/` selects
the extension suite and owes it a run of record. Every close from here records
two.

## Where things were at session 38

**Sessions 37 and 38 of 50 are closed VERIFIED.** The ledger reads 38 of 50,
and `dabbler status` now says so for the right reason rather than by accident.

- **Session 38 closed the defect `csv-model` found and the framework could not
  see.** `progress.ts` consulted `session-plan.md` only when the ledger was
  absent, so a planning session whose whole deliverable was new headings closed
  on a record that said the project was finished. The plan is now read on every
  projection; a session it declares that the ledger has not reached projects as
  **`planned`**, `totalSessions` counts those rows, and the close prints what
  comes next. Two rounds: round 1 raised one Major and two nits and **all three
  were correct**.
- **The Major is the one to remember.** This session defined `not-started` as
  "registered, and not begun" and then left plan-only repositories — the state
  every project is in before its first `session start` — still saying exactly
  that for sessions nothing had registered. All twelve new tests called
  `registerSessionStart` first, so the path was uncovered. The verifier had
  `agency: none` and could not read the tree; it inferred the gap from the
  guard condition and the shape of the tests.
- **`planned` cannot be stamped where it would seem natural.**
  `validateInvariants` accepts only the ledger's four statuses *and* requires
  contiguous numbering, and it runs over the derived view — so the state is set
  in the projection loop, after validation. Stamping it in `sessionsFromPlan`
  makes a fresh repository report an invariant violation instead of its
  sessions. The schema gained a separate `projectedSessionStatus` rather than
  widening the vocabulary shared with tasks.
- **The existing suite caught a regression this session introduced.** The first
  implementation appended plan rows over a ledger that was present and
  unparseable — replacing a broken record with a cheerful guess, which is the
  distinction `ledgerExists` exists to keep. The test that names it failed and
  was right.

> **A trap this session hit and the next one should not.** `dabbler` runs from
> `packages/router/dist/`, which is gitignored and rebuilt only on demand. A
> session that edits router source and then runs a `dabbler` verb **runs the
> previous build**. Session 38's own close printed a line from pre-remediation
> code and looked like a defect in work that was already committed and correct.
> It was harmless here because the stale code was a message. It would not be
> harmless if the change were to a gate: the close would have judged the
> session with the logic the session had just replaced. **Run `npm run build -w
> dabbler-ai-router` after touching router source and before running any verb
> that reads it.**

**Owed before session 41, from session 37 (D242):** `tools/` is covered by no
declared suite, so `dabbler affected` selects zero tests for an extension-only
change. Sessions 41, 42, 43 and 47 are all extension-heavy. Session 39 owes the
declaration.

**Also owed to session 40 (D240):** `session start` already seeds a session's
plan steps and `session log` ticks them; what is missing is the join to the
projection the tree renders. Session 40 must re-derive its approach from both
mechanisms before writing code.

## Where things were at session 37

**Session 37 of 50 is closed, and the block it opens is the operator's.**
Sessions 37–50 turn the framework toward the person operating it, planned
against the operator's eight DX principles of 2026-08-30, `csv-model`'s
nine-item feedback log, the RACI proposal in `docs/raci-fable.md`, and a
parallel review of the plan's first draft by `gpt-5-6-sol` and
`gemini-3-1-pro`.

- **Session 37 was a survey, and it is `docs/extension-dx-survey.md`.** Thirteen
  findings across 24 files and 4,029 lines of extension, each with an owning
  session. Two were fixed in the session because they needed no design
  decision; the rest were filed, not fixed. Four Majors, three of which sit on
  the "create a project" journey — the one a new developer meets first.
- **The eight status icons were declared in millimetres.**
  `width="16mm" height="16mm"` against a 16-unit viewBox, rendered in a 16-pixel
  tree row: about 60 CSS pixels of intrinsic size. That is the probable cause
  of `csv-model` feedback item 1, which its own session filed as unverifiable
  because a session has no view of the rendered UI. Static reading found what
  looking could not.
- **Three decisions, and the one that matters most was not in the plan.**
  D242: `tools/` is covered by no declared suite, so `dabbler affected`
  selected **zero tests** for a change set of two extension sources and eight
  extension assets, and this session could have closed green having run
  nothing. That is `csv-model` item 3's defect on this repository. It is
  assigned to session 39 and **must land before session 41**, because 41, 42,
  43 and 47 are all extension-heavy. The extension suite was run by hand
  instead: 123 passing, exit 0.
- **D240 corrects session 40's premise before session 40 starts.** `dabbler
  session start` already seeds a session's plan steps from its step list —
  this session's own start printed six, each with a `stepKey`, and `session log`
  ticks them. Session 40 was planned as though those steps did not exist. They
  do; what does not exist is the join to the projection the tree renders, since
  `buildTaskRows` folds an `approved-plan.json` nothing writes while the seeded
  rows sit in the activity log. Two mechanisms, one purpose, and the tree reads
  the one nobody writes. Session 40 must re-derive its approach from both.
- **D241 records what the survey deliberately did not change.** Six sites move
  text from the framework to an engine through a person. Removing them means
  building an executor, which is RACI open item 1 and the operator's decision,
  not a survey's.
- **One RACI cell is corrected rather than followed.** It marks the Solution
  Explorer a live defect because the projection's only writer was Python and
  was deleted at the cutover. `writeProjection` is TypeScript and six sites
  call it; the tree is empty because nothing scaffolds a manifest, the one
  read-only verb computes without writing, and there is no `viewsWelcome`.
  Session 42 wires rather than builds.

**The sessions are strictly sequential.** The ledger holds one `in-progress`
entry, `declare` takes the lifecycle lock, and session 37 has now amended the
step lists of 39, 41, 42, 43 and 47 — two more than it planned to, because the
survey found findings they owned.

## Where things were at session 36

**The port is done.** Sessions 22–36 replaced a Python package and a
TypeScript renderer over it with one TypeScript implementation. There is no
`ai_router/`, no `tests/`, no `pyproject.toml`, no `pytest.ini`, no Python CI
job, no Python suite in `dabbler.yaml`, and no parity control — the control
compared two routers and there is one. A project that adopts this framework
installs **nothing**: the extension bundles the router, calls it in-process,
and puts `dabbler` on the integrated terminal's PATH run on the editor's own
Node.

- **Session 36 is closed `VERIFIED`** — **3 rounds** (gpt-5-6-sol over the
  API), Claude Code / claude-opus-5[1m] orchestrator, all five gates green at
  the first attempt, nothing forced. **The whole set's acceptance test is
  that this paragraph is true**: the rounds, the disputes, the run of record,
  the gates and the close were all performed by the TypeScript router, in a
  tree with no Python in it. The ledger reads **36 of 36 complete**.
- **Rounds 1 and 2 raised the same two Majors and round 2 is the one that
  mattered.** Both rounds said `dabbler packaging` cannot publish this
  repository and that the round row spells the stamp `framework_version`.
  Two evidence-backed disputes were filed and **both were upheld** — and the
  verifier did not contradict a fact in either. What it said is that
  establishing why a requirement cannot be met *proves the missing capability
  rather than satisfying the requirement*, and that a unilateral substitution
  is not an amendment. **That is right, and it is the lesson of this
  session**: a session that cannot follow its plan must amend the plan on the
  record, not argue with the finding. Round 3 verified.
- **Round 1's most valuable finding was a nit, and it was a defect this
  session introduced.** Rewriting the release workflow dropped `!vsix-v*`
  from its tag trigger. GitHub's `v*` glob matches `vsix-v2.0.0`, so every
  Marketplace tag push would have started the router's npm workflow and
  failed its classify job. No control could see it — the YAML parses and the
  workflow is syntactically fine — and the old file's own comment had
  explained the exclusion, which is exactly the comment a rewrite drops.
  **A rewrite of a working file inherits its constraints or loses them
  silently.**
- **Round 3 verified with two nits, both about the amendment's own wording,
  and both were corrected AFTER the close.** One said the amendment credited
  "a third round" with upholding the findings when round 2 did; the other
  said the step-6 amendment left the supporting acceptance check ("seat cost
  is recorded for every session 22–36") contradicting it. Both are fair and
  both are fixed. **They could not be fixed before the close**:
  `session-plan.md` is not a lifecycle-written file, and `verification_clean`
  compares the worktree to the verified tree — a session editing the plan it
  is running against is drift, which is what that exclusion list exists to
  say.
- **The parity control's last run is D231, and it is recorded with the trees
  it ran against.** 5 shapes, 48 verb cases, 402 paths, all identical, exit
  0 — the same figures as session 35, which is the second thing it records:
  the first half of this session moved the extension off the spawn and put
  three new seams into the router package (`workdir.ts`, the capture in
  `cli/output.ts`, `inProcess.ts`), and every verb writes through two of
  them. 402 identical paths afterwards is the evidence that none of it
  changed what a verb says or writes. The Python tree
  (`52b0c51c`) and the TypeScript tree (`f8e93b7e`) are named in the
  decision, so the claim is checkable rather than remembered.
- **`InProcessRouter` reaches every verb through its own command-line
  handler** (D232), with `capture` collecting what the handler wrote and
  `standIn` answering the paths it did not name. Reaching past the handler
  into the module would have been a second implementation of the argument
  checking and the refusal wording — the extension would then show an
  operator a sentence the terminal never says. The three answers with a
  schema call their module directly, because rendering an object to JSON to
  parse it back is a round trip nothing needs.
- **`process.chdir` was not available, and that is why `workdir.ts`
  exists.** The extension host is one Node process shared with every other
  extension. `workingDirectory()` is now the one answer to "where is the
  router standing", replacing three scattered `process.cwd()` calls, and
  `standIn` refuses to nest rather than let two verbs resolve half their
  paths against each other.
- **A verb runs on the caller's thread, which bounds what the extension may
  ask for.** The projection is a few file reads behind an mtime cache;
  `session cancel` is a click the operator is watching. `verify` and
  `workflow` buy models and run suites, and they belong in the terminal,
  which is where the lifecycle runs them. A future session that wants
  `verify` behind a button needs a worker, not a smaller comment.
- **The bundle carries a `package.json` that says what it is** (D233), and
  that is the load-bearing part of the asset move. `PACKAGE_ROOT` walks up
  for a manifest NAMING the router; inside a VSIX the nearest one above
  `dist/extension.js` is the extension's, so the walk would have run off the
  top of the filesystem on the first config load — on somebody else's
  machine, with nothing to fall back to. `esbuild.js` writes a two-line
  manifest beside the bundle and copies the router's runtime data next to
  it, taking the asset list from the router's own `files` rather than
  restating it.
- **The terminal shim stopped resolving a package it does not ship.**
  `require.resolve("dabbler-ai-router")` answered correctly in a workspace
  and could not answer at all in a VSIX, because `.vscodeignore` excludes
  `node_modules`. That was survivable while the shim was a convenience; it
  is the operator's only hand-run surface now. The extension builds
  `dist/dabbler.cjs` itself and the shim looks beside itself — proved
  directly: `node tools/dabbler-ai-orchestration/dist/dabbler.cjs status`
  reads this repository's ledger and finds its own schemas.
- **`engines.vscode` is `^1.135.0`**, which is D131's rule rather than a
  guess: the lowest VS Code whose extension host carries an unflagged
  `node:sqlite`, *found by running the check on that release*. 1.135 is the
  one that has been measured, so it is the floor until a lower one is.
- **`frameworkVersion` is the set's one record change and nothing is
  back-filled** (D234). A row without the stamp was written before the stamp
  existed, and filling it in with today's version would replace a fact with
  a guess nobody can check. The session stamp is carried across rebuilds
  beside `startedAt`; the round stamp is written in `appendRound` rather
  than at the three call sites that build a row, because a stamp a caller
  can forget is absent on the row that most needed it.
- **The verb table shed the port's scaffolding** (D235). `pythonModule`,
  `pythonCli` and `portedInSession` are gone; `contracts.test.ts` now holds
  the table and the registry to each other in both directions. `ledger` and
  `approved-plan` leave the table (libraries, no command line) and stay on
  the contract, where `InProcessRouter` implements both for the first time.
  `ledger.unresolved` is trimmed outright — declared in session 23 and never
  implemented on either side, which is D162/D152 exactly. **`progress` is
  gone and `status` is the one name**: the alias existed because the
  extension spawned `progress`, and it calls a method now.
- **`--irreversible-delete` is what made this session reviewable at all**
  (D236). Deleting `ai_router/` and `tests/` makes `git diff HEAD` **2.3
  MB** — four times the cap, and roughly 600,000 tokens of removed Python
  with the twenty lines that are not a deletion somewhere inside it. git's
  own flag drops the removed LINES and keeps every `deleted file mode`
  header: **256,668 characters**, inside the cap, nothing hidden.
- **The session plan is AMENDED, and that is the operator's to reverse**
  (D238). Two of session 36's steps ask for what the implementation cannot
  do — publish two artifacts through a packaging block that models one, and
  bump a version discriminator the round record has never had. Rounds 1 and
  2 both raised them as Major and both of round 2's acceptance criteria
  named the same resolution: *or the governing plan must be formally amended
  before the session claims completion*. The amendment is written into
  `docs/sessions/session-plan.md` beside the steps it changes, so a reader
  of the plan meets it rather than finding it in a decision. **It changes
  what this session was required to deliver**, which is not a model's call
  to make silently — it names what the plan asked, what was done instead,
  and what reversing it would cost.
- **The release path is the two tag-driven pipelines, not the packaging
  block** (D237). `dabbler packaging` refuses this repository and is right
  to: the block describes one pack and one push, and there are two artifacts
  and two registries. `release.yml` publishes to npm now instead of PyPI
  (same tag shapes, same OIDC, same green-Test gate); the `Test` workflow
  lost its Python job. **Both artifacts sit at 2.0.0 and the tag push is the
  operator's** — it is irreversible, it goes to two public registries, and
  the credentials live in GitHub environments rather than on this machine.
- **`packaging.ts`'s `recordedAt` writes Python's rule** (D223, discharged):
  microseconds, and no fraction at all when the value is whole. It had
  millisecond precision and wrote `.000` where the reference omitted the
  fraction; nothing compared it then and this is the commit where the
  record's timestamp format changes for anybody.
- **Three vendor calls, 139,326 tokens, no seat** (D239) — 125,632 in /
  13,694 out, all `gpt-5-6-sol` over the direct API. Second most expensive
  session of the port behind session 35's 147,120, and a different shape: the
  three rounds are comparable in size because rounds 2 and 3 carried
  file-backed disputes and then a plan amendment into an otherwise small fix
  delta. **Disputing is not free** — a rebuttal rides the prompt whole.
- **Session 36's own ledger row carries no `frameworkVersion`, and that is
  correct.** `session start` ran through the Python router at 18:42, before
  the stamp existed; the three round rows, written after it, all carry
  `framework_version: 2.0.0`. The one session that spans the cutover records
  it by the absence, which is what the field was designed to mean.
- **The Playwright layer was ported and is NOT exercised by this session.**
  It built its fixtures by running Python snippets and pinned a
  `dabblerSessionSets.pythonPath` that no longer exists as a setting; it now
  spawns the extension's own `dist/dabbler.cjs` for the CLI verbs and runs
  the router's source under Node's type stripping for the two writes that
  must go through a sanctioned writer. It is not a declared suite and does
  not run in CI, so this is a coherent harness rather than a verified one.
  **What would verify it is one Layer-3 run on a machine with the VSIX
  installed.**

### Session 35, still current

- **Session 35 is closed `VERIFIED`** — **3 rounds**, one finding disputed and
  **withdrawn**, one disputed and **upheld against a dispute that was wrong**
  (gpt-5-6-sol over the API), Claude Code / claude-opus-5[1m] orchestrator.
  Round 1 raised three Majors; round 2 raised two more, one of them a defect
  the remediation itself introduced.
- **The plan's paragraph and D129's inventory are two records of one
  decision, and they disagreed** (D224). The session plan lists `fixloop`
  (563) and `testphase` (345) on the run core's deletion list; D129 puts both
  on the **port** list and says why in its own table — `workflow` imports
  them, so they are the six-step driver's remediation loop and tests phase.
  `facts` is on the plan's deletion list too and is what `verify` runs on.
  **The real shape was six modules ported and three deleted**, 3,102 lines and
  127 tests rather than the paragraph's 2,194 and 99 — a session planned
  against the prose would have been planned at two-thirds of its size.
- **The import audit is necessary and was again not sufficient.** Twenty-one
  symbols across six modules, all resolving, with the git seam in `journal.ts`
  where D129 said it would be. It cost minutes and it is what turned the
  plan/inventory conflict into a decision instead of a deletion. It did not
  catch that `dabbler.yaml` still selected deleted test files; the verifier
  did.
- **`test_runcore_checks` drives `checks` through the run core's own command
  line** (D225). D129 kept it on the grounds that its subject is `checks`
  rather than the run core it is named for. That was right about the subject
  and wrong about the driver: all twenty tests go through `cli("check",
  "--run", ...)`, so the file cannot import once `runcli` is gone. It is
  deleted, and `packages/router/test/checks.test.ts` — which says in its first
  line that it is the port of that file — already carries the behaviours at 22
  tests. **The Python suite lands at 832, which is exactly D129's predicted
  total**; the entry was right about the number and wrong about which twenty
  made it up.
- **`ai_router/checks.py` has no Python test driving it directly for one
  session.** Recorded rather than papered over. It is not uncovered — the TS
  port has `checks.test.ts`, the parity control compares every verb that runs
  a check, and session 36 deletes the module.
- **`[project.scripts] dabbler` pointed at `ai_router.runcli:main` and went
  with it**, which settles the collision session 34 left open: the terminal
  shim, the managed fence and the commit guard all name `dabbler`, and until
  now a `pip install -e .` put a second unrelated one on the same PATH.
- **`dabbler status` exists, and the dispute that argued it should not was
  wrong** (D229). Round 1 called its absence a Major; the dispute cited that
  the verb had never been in `contracts/verbs.ts`; round 2 upheld the finding
  with "adding `status` is not inventing an unsolicited verb when the
  governing plan names it." That is right. **D130 named the command when
  `dabbler` still WAS the Python CLI** (`[project.scripts] dabbler =
  "ai_router.runcli:main"`), so "`dabbler status` now reads the lifecycle's
  record" meant *keep the name, change what it reads* — and D162's
  no-invented-verbs precedent, which covers verbs no plan named, does not
  reach it. It is an alias: `statusVerb` delegates to `progressVerb` with the
  name it was invoked under, so there is one projection and the usage text
  says what the operator typed.
- **A dispute is only as strong as the kind of fact it cites.** Three of this
  port's disputes have been withdrawn against citations of what the code
  *does*. This session filed two: the one citing
  `ai_router/workflow.py:1221` — `--author-provider` optional in the
  reference implementation — was **withdrawn in full**; the one citing an
  *absence* was upheld. Absence proves a thing was not built, never that it
  should not be.
- **The remediation introduced its own Major, and the verifier caught it.**
  Removing the stale `when: ai_router/pricing.py` rule — a genuinely dead
  rule, whose trigger module was deleted back in session 8 — took three lines
  and orphaned the other three selects into the preceding rule. The YAML still
  parsed and every named path still existed, so the audit that prompted the
  removal was blind to it. **The rule is restored whole.** Out-of-scope
  tidy-ups in structured config are how a fix becomes a defect.
- **Deleting a dead deny-list entry silently widened an allow-list** (D228).
  The parity control's `EXCLUDED` carried four run-core records; nothing writes
  them now, so they were removed as dead configuration. `COMPARED` matches
  `^\.dabbler/runs/s\d+/.+$` — the whole directory — so those entries were what
  *bounded* that pattern rather than a description of files that exist. The
  suite went red on the first full run and they are restored, with a comment
  saying why they stay. "Nothing writes this any more" argues for deleting the
  writer and never on its own for deleting the rule that bounds a reader.
- **3,102 Python lines became 4,225 TypeScript across twelve files** — 1.36x,
  against the 1.32x running ratio (D227). The excess is the CLI: `workflow`
  has ten subcommands and argparse sub-parsers do not translate. `workflow`
  split four ways on the seams it already had — `log` (523: events, the
  transition judge both sides call, the fold), `commands` (564), `terminal`
  (302: the caps and the three terminal states, which read a folded state and
  a tree rather than the log), `project` (176) — plus `cli/workflow.ts` (381).
  The other five modules are one file each.
- **The parity control gains three cases and no shape** (D226). `solution.yaml`
  is eight lines added to the corpus **seed**, so every shape carries it for
  one `writeFileSync` per copy and no router invocation — a sixth shape would
  have been built twice on every round of every session that follows.
  `workflow enter` compares the *second* `enter`, which is the only version
  that exercises the fold, the transition judge and `sort_keys` at once;
  `workflow status --json` compares the projection as the extension receives
  it; `solution check` compares a rendered report. **`contractdoc` gets no
  case**, deliberately: its output goes to a caller-named path no compared
  pattern covers, and its diagram is a pure function driven by thirteen
  differential tests instead.
- **Parity: 48 cases, 402 paths, all identical**, across all five shapes.
- **Suite: 832 Python (4:54) / 964 router vitest (4:09, plus 4 live tests
  skipped); all four declared controls green.** Python is down 109 and
  TypeScript up 128 — the 127 ported plus the `status` alias's own.
- **One test needed a declared timeout.** `testphase.test.ts`'s
  two-ecosystem case spawns two real subprocesses, which is the claim it
  makes; under the whole suite's parallelism that outran vitest's 5 s default
  though it passed in isolation. It carries `30_000` and says why.
- **The verb table's announce-then-implement example is exhausted.**
  `contracts.test.ts` asserted the discipline by naming a declared-but-
  unregistered verb — `verify` until session 33, `workflow` until this one —
  and its own comment called that "a countdown". It now computes the set from
  the table and asserts each member names the session that lands it, so it
  stops needing an edit. Two qualify today: `ledger` and `approved-plan`, both
  `pythonCli: false`.
- **Three vendor calls, 147,120 tokens — the port's most expensive session**
  (D230), ahead of session 23's 136,020, with round 1 alone 86% of it. Rounds
  2 and 3 cost 5.6% of round 1's input each. **No seat transport was used**, so
  `seat_cost` has nothing to answer for this session and it is not comparable
  to the seat series.
- **The run core's two design documents are marked superseded, not deleted.**
  `docs/run-core-blueprint.md` (1,361 lines) and
  `docs/run-core-phase0-report.md` (425) describe an implementation that no
  longer exists in any tree. They stay because D130's authority rests on the
  evidence in them, and a decision whose reasoning has been deleted cannot be
  re-examined.

## Where things were at session 34

- **Session 34 is closed `VERIFIED`** — **2 rounds**, the Major of round 1 disputed and **withdrawn** (gpt-5-6-sol over
  the API), Claude Code / claude-opus-5[1m] orchestrator. Round 1 raised one
  Major and one nit, **both describing the Python reference implementation
  rather than the port**, and the Major was disputed with three citations.
- **The managed fence and the commit guard now name `dabbler`, and the
  Python side moved first — because the hook has no byte-identical form**
  (D218). The session plan's step 2 and the parity control's compared-path
  list were in direct conflict: the plan says both files name the shim, the
  control says both are compared byte for byte and that the TypeScript side
  is the one that moves. **The hook settles it and the fence follows.**
  Python bakes in `sys.executable`; TypeScript's nearest value is
  `process.execPath`, a different absolute path outside the copy root that
  normalization 2 does not rewrite. There is no spelling of "each router
  names its own interpreter" that produces the same bytes — so either both
  write a PATH-resolved command or the control is red forever on a file the
  plan explicitly assigns to this session. Python moved in its own commit,
  and **every file `bootstrap` writes is now byte-identical between the two
  routers**, proved directly on two scratch repositories before the control
  was asked.
- **This repository's own three instruction files were NOT regenerated, and
  that is deliberate.** They still name `.venv/Scripts/python -m
  ai_router.<module>`, which is what a session in *this* repository actually
  runs while two routers exist — the preverify runs this session recorded
  were `python -m pytest`. Session 36 already owns rewriting them, and it is
  the commit that makes the new text true here.
- **`bootstrap` is the first compared verb to print a non-ASCII character,
  and it exposed a runtime difference rather than a router one** (D219).
  Python encodes `sys.stdout` with the console code page unless told
  otherwise, so an em dash leaves `print` as one cp1252 byte where Node
  writes three UTF-8 bytes. The control's letter says the TypeScript side
  moves — which here would mean **teaching a cross-platform command to emit
  cp1252**, and leaving session 36 to change it back silently in the commit
  that deletes Python. So `PYTHONIOENCODING=utf-8` is pinned in the corpus's
  `PINNED_ENV` beside the fixed committer date. It is an **input, not a
  third normalization**: it rewrites nothing after the fact, so the rule
  that the two normalizations describe everything that happens to an output
  once it exists still holds exactly.
- **The zero-install proof passed, and it found a commit guard that could
  never have resolved on Windows** (D220). `dabbler session start`
  registered session 001 in a repository with no `.venv` and no Python on
  `PATH` — but the first commit printed `dabbler: command not found` from
  the hook. The launcher was `dabbler.cmd`, correct for `cmd.exe` and
  PowerShell where PATH lookup consults `PATHEXT`; the guard is a
  `#!/bin/sh` script, and the shell git ships does not consult PATHEXT. It
  looks for a file named exactly `dabbler` and finds nothing.
  **Every commit on every Windows machine would have printed that line and
  been let through** — the guard installed, present, and inert.
- **Nothing on either side could have caught it, and that is the lesson.**
  The hook's failure direction is deliberate: anything that is not the
  guard's own verdict exits non-blocking, so the symptom is a line of stderr
  and a commit that succeeds. The parity control is green *and correct* —
  both routers write the same hook text, and the file they agree on is one
  neither of them can execute. **A control that compares two writers cannot
  see that what they agreed on does not run.** Only executing it on a
  machine with nothing installed produced it. The fix follows npm's own
  global shims: on Windows the extension writes **both** `dabbler.cmd` and
  an extensionless `dabbler` POSIX script, the latter with forward-slash
  paths because MSYS treats a backslash inside double quotes as an escape.
- **One shim limitation is documented rather than fixed.**
  `EnvironmentVariableCollection` applies to terminals only, so a commit
  made from VS Code's Source Control panel runs git in the extension host's
  environment, where `dabbler` is not on `PATH` and the guard exits
  non-blocking again. `npm i -g dabbler-ai-router` closes it, and the
  managed fence now says so for anywhere that is not a VS Code terminal.
- **The recipes the router PRINTS still name Python, deliberately** (D221).
  The proof's transcript shows three: `REFRESH_COMMAND`, which the handoff
  into this session already addressed to the cutover, plus `session start`'s
  next-step hint and the selector's recipe, which it did not. They are
  correct in *this* repository and wrong in a consumer one, and changing
  them would cost a third Python-side edit that D218's test does not
  license — these strings have a perfectly good byte-identical form, which
  is the one they have. **Session 36's step 5 should grep for
  `python -m ai_router` across strings the router prints**, not only across
  the docs it names.
- **1,891 Python lines became 2,433 TypeScript across six files** — 1.29x,
  in line with the 1.32x ratio since session 25. `packaging.ts` (829) and
  `cli/packaging.ts` (167); `bootstrap/` split four ways as `templates`
  (446), `detect` (285), `index` (250) and `env` (205), plus
  `cli/bootstrap.ts` (251). The extension gains `terminalShim.ts` (152).
  **`templates.ts` was generated from the Python source rather than
  transcribed**, then re-emitted one source line per rendered line, so the
  fence's 6,052 characters are byte-exact by construction and still
  reviewable.
- **The parity control gains two cases and the corpus gains no shape.**
  `bootstrap` on `fresh` compares the refresh path — three engine files, the
  guard, the ignore rule recognised, the refspecs. It does **not** reach the
  scaffold path, which is the one a consumer project takes: that needs a
  project carrying no plan and no config, which is a sixth shape built twice
  on every round of every remaining session, and it would not be enough on
  its own because neither `dabbler.yaml` nor `session-plan.md` is in the
  compared-path list. So the branch is driven against the reference directly
  in `differential.test.ts`, over a project with no build file and one that
  is four ecosystems at once — session 33's stated pattern, chosen over
  widening both lists. `packaging --dry-run` on `in-flight` reaches the
  releasability refusal and stops there, which is all a shape without a
  `packaging` block can reach.
- **Both documented `bootstrap` side effects were checked after every run,
  and neither fired.** `.gitignore` is untouched in this repository, and no
  transport preference was written: every invocation passed
  `--no-transport-detect`, including both sides of the parity case, because
  a comparison that persisted an environment variable on the host twice per
  round would be reaching outside the thing it compares. The user-scope
  `DABBLER_TRANSPORT=api` on this machine **predates the session** —
  `resolveBootstrapTransport` can only ever persist `copilot-cli`, never
  `api`.
- **63 TypeScript tests for the two ported modules against Python's 55**
  (after parametrize expansion), plus 2 scaffold differential tests and 5
  extension shim tests. The 8 extra are branches Python leaves untested and
  each is a distinct refusal: a block declaring one half and not the other,
  a push naming no feed, a push naming no credential, a non-positive
  timeout, a command that could not start, and refusing to file a dry run.
  None is a falsifier twin or a source-text assertion.

### Session 33, still current

- **Session 33 is closed `VERIFIED`** — **2 rounds** (gpt-5-6-sol over the
  API), and **both rounds were bought by the TypeScript loop**, not by
  Python. That is the session plan's step 7 taken literally and the first
  time the ported router has purchased a verdict for this repository's own
  record. Round 1 raised one Major and two nits; the Major was **accepted
  and fixed**, and one nit's obvious fix turned out to be drift (below).
  Claude Code / claude-opus-5[1m] orchestrator. All five gates passed at the
  first attempt; nothing was forced.
- **`verify` (2,537 lines) is seven files, not the plan's five, and the
  verifier was right to say so** (D211). The constraint that mattered holds:
  `rounds.ts` is the largest at 716 and none exceeds 800. `errors.ts` (57)
  is the file the plan's list does not name and the one that most needed to
  exist — six seams return the same six exit codes, an orchestrator branches
  on them, and a refusal answering 3 where its twin answers 2 is drift no
  record could see. The other six are `prompts` (357), `rounds` (716),
  `disputes` (548), `reanchor` (272), `prepare` (325) and `steps` (620),
  plus `cli/verify.ts` (321). **3,200 Python lines became 4,232 TypeScript
  across ten files** — 1.32x, the ratio since session 25. The suite went
  686 → **771**.
- **`facts` (663 lines) had never been ported, and the consumer is what
  found it** (D210). D129 assigned it to what is now session 32 — "Session
  31 takes it", pre-renumbering — and session 32's own text in the session
  plan never named it. Nothing detected the gap: not the verb table, which
  carried `portedInSession: 32` silently; not the parity control, which had
  no `facts` case; not the suite. It surfaced when `verify`'s imports were
  written out. The port's four known sizing-error shapes are all questions
  asked of a module in isolation; **this is a fifth, asked of the sequence —
  a module's session assignment and the session plan's prose are two
  records, and nothing checks that they agree.**
- **One rule could not be ported by copying it, and the record cannot see
  the difference.** `facts.run_control` rewrites `python`/`python3` to
  `sys.executable` so a control runs in the router's own environment. There
  is no Python beneath this router to substitute, and after the cutover
  there is none in the product at all — so the RULE is ported rather than
  the substitution (`node` → `process.execPath`). `ControlFact.command`
  carries the DECLARED command and never the resolved argv, so both routers
  write the same bytes, which is what the two `facts` cases compare.
- **The parity control goes from 2 shapes / 28 cases / 179 paths to 5 / 42 /
  366, and got FASTER** (D213, D214). `disputed`, `at-cap` and
  `moved-machine` are built for the first time, each driven through the
  Python router's offline transport with scripted verifier text. A shape is
  now built **once** and copied per case — D169's named lever — and the
  measurement is the point: **161 s for 42 cases across 5 shapes, against
  193 s for 28 across 2.**
- **Round 1's Major was a vacuous corpus shape, and it is D207's defect in a
  new place** (D212). `moved-machine` cloned the working repository. Since
  D135 the session record and the run ledger are untracked, so the clone had
  neither — and every `verify reanchor` case passed by watching two routers
  agree that no session was in flight, while `baseline-reanchors.jsonl` was
  never written and never compared. A local `git clone <dir>` also
  **hardlinks the whole object store**, so even with the record restored the
  recorded tree would have arrived and taken the refusal branch. It now
  clones the **bare remote** (with `--branch main`, because a bare HEAD names
  the branch `init --bare` chose), copies the record across without the
  objects, and **asserts its own premise**: it reads round 1's
  `completion_tree` out of the copied ledger and refuses to build if
  `git cat-file -e` finds it. **A corpus shape that cannot fail is worse
  than a missing one** — it reports a pass for a comparison that never ran.
  The fix is measurable: **339 → 366 compared paths**, the 27 being the
  files the case exists to compare.
- **Caching changed what the determinism check is FOR, and three shapes
  genuinely lack it** (D213). It used to be a precondition — each case built
  the shape twice, so a non-reproducible shape surfaced later as router
  drift that was not one. Both copies now come from one build and are
  identical by construction. But once a shape records a round, its
  `completion_tree` hashes the working tree *including the lifecycle's own
  bookkeeping*, and two builds can never agree on it. A timestamp can be
  normalized; a hash over one cannot. So the object id is reduced **for the
  determinism comparison only** — the same concession `DIGEST_LEDGERS`
  already makes — and scoped to the question that needs it: **two builds are
  two clocks; two routers share one build.**
- **The richest judgement in the module is now compared without paying a
  model.** At the cap the loop decides which of the two terminal states this
  is *from the record*: the last round's finding cites `src/widget.py`,
  nothing has moved since, so the fix delta touches no cited path and
  REMEDIATED AT THE CAP is not earned. Both routers must reach UNRESOLVED,
  list the finding with its citation, and write no terminal row.
- **Four differential tests, and two sentences that were wrong are corrected
  in place** (D215). The closed-step row, the agency record, the
  deterministic-facts row, and **D168's look-alike verdict token** —
  discharged here rather than in 32, because the previous *Next* took D168's
  literal "session 32" without applying D188's renumbering. The parity doc
  claimed an agency comparison "cannot" exist before `verify` lands; what
  cannot exist is a *file* or a *CLI case*, and the fold could have been
  compared any time. A test comment claimed a `.venv`-only guard covers
  every machine with Python; it does not, and now says so.
- **A nit about fidelity whose obvious fix was itself drift** (D216). The
  verifier observed that unknown flags were silently ignored, so
  `--max-round` would run at the default cap. Refusing unknown flags looked
  like the fix — but running the same token through Python showed argparse
  **accepts** it, because argparse resolves any unambiguous prefix.
  Refusing it would have turned a working command line into an error for the
  same words. Both halves are ported: `verify step open --s x` now prints
  `ambiguous option: --s could match --sessions-dir, --step` on both
  routers, byte for byte. **A fidelity nit has to be checked against the
  reference, not against what the reference is assumed to do.**
- **944 pytest / 771 vitest, both green as `final-full`.** Seat cost (D217):
  **73,740 in / 14,299 out** over two rounds; round 2 cost 11% of round 1's
  input.

### Session 32, still current

- **Session 32 is closed `VERIFIED`** — **3 rounds** (gpt-5-6-sol over the
  API). Round 1 raised three Major: one accepted in part and fixed, two
  **disputed with file and line and withdrawn**. Round 2 verified. The close
  then **refused**, correctly, and round 3 was the answer. Claude Code /
  claude-opus-5[1m] orchestrator. Nothing was forced.
- **`agency` (921), `approved_plan` (590) and `plan_review` (812) are ported
  whole; `verifyjob` is ported as 56 lines, not 782** (D204). The session
  plan sizes that module at its pre-split figure; D129 splits it, and the
  retired ~680 lines are `cmd_verify` and its helpers, which import `runcli`
  and `runcore` and are deleted with them in session 35. Measured rather
  than inherited — `build_prompt`'s only caller in the whole package is
  `cmd_verify`, so D129's own criterion ("what `verify` and `route` import")
  names one function too many. **This error has already cost this port a
  session once**: D178 took `checks.plan` back out of `checks.ts` for the
  same reason. The suite went 618 → **690**; 2,379 Python lines became
  2,825 TypeScript across four files.
- **`route.ts` stops refusing itself by name.** The branch that threw "the
  auto-verification job … is ported in session 32" is gone, replaced by the
  real one and four tests: a `code-review` verified through a different
  provider, the metrics row bound to the model it reviewed, the paid-for
  answer surviving a verifier that cannot be reached, and a verification
  that does not verify itself.
- **The JSON seam gained `sort_keys` and `separators`, because the plan hash
  is a digest over them** (D206), checked byte-for-byte against CPython on
  five inputs. `sortKeys` orders by **code point** — JavaScript's default
  sort is by UTF-16 code unit, and the two disagree above the basic plane.
  **The proof is the artifact, not the option**: Python wrote and approved a
  plan the TypeScript `readPlan` accepted (which recomputes both hashes and
  refuses on either mismatch), and TypeScript wrote one Python accepted,
  same `plan_hash` on both sides.
- **Round 1's *nit* was the most valuable thing in the round, and it landed
  against a comment asserting the opposite of the truth.**
  `buildVerificationPrompt` filled its placeholders with JavaScript's
  `replace(string, string)`, which is neither global (Python replaces every
  occurrence) nor literal (`$&`, `` $` `` and `$1` expand against the
  match). Both are reachable from an ordinary routed response, because the
  text under review is substituted verbatim — any answer discussing shell or
  regex syntax was corrupted before the verifier read it. Fixed with
  `replaceAll` and a **function** replacement, the one form that is both.
- **D198's `ApprovedPlanReader` is registered, and proved through the built
  bundle rather than the source** (D207). Both routers now fold the same
  non-empty task row out of a real plan.
- **`approved_plan` has no CLI on either side, so it is compared through its
  caller — and that is the finding, not a shortcut** (D205). `ParityCase`
  compares `python -m <module>` against `dabbler <verb>`; `verbs.ts` has
  recorded `pythonCli: false` for `approved-plan` since session 23 and
  `plan_review` has no verb entry at all, so no case in the table's shape
  can exist. The `in-flight` builder now writes and approves a real plan and
  opens its step, and the existing `progress --json` case compares the fold.
  **Before this, both routers agreed the task list was empty** — which reads
  as proof and is not. 28 cases, **179 paths**, up from 137.
- **The plan WRITER is gated by a different instrument, and it was falsified
  before it was trusted.** Both copies' artifacts are Python-written, so no
  CLI case can reach the TypeScript writer. A differential test drives both
  writers over one input, compares the bytes, and hands the TypeScript
  output to Python's own `read_plan`. Flipping `sortKeys` to `false` in
  `coreBytes` turns it red.
- **A third digest ledger names itself**: `approved-plan-writes.jsonl` joins
  `state-writes.jsonl` and `api-models.lock`, under the rule those two
  already state — its rows are hashes over content carrying `approved_at`.
  The plan's own `plan_hash` is **not** reduced, and is the strongest single
  check in the corpus that both routers canonicalize JSON identically.
- **The close refused once, and the gate was right** (D209). Three edits
  made *after* round 2's VERIFIED — a doc paragraph, a test comment and a
  flake timeout — moved the tree, and `verification_clean` caught them.
  Earlier in the session a `close --dry-run` showed that gate passing, and I
  read it as licence; it passed because the edits had not been made yet.
  The gate does not ask whether a change was behavioural. **`--force` was
  not used and would have marked sessions 33–36 complete.** The correct cost
  was one cheap round.
- **A pre-existing flake was fixed because a run of record must be green.**
  `checks.test.ts` ("hands the child an allowlist") seeds a git repository
  and spawns Node twice against vitest's default 5 s; it passes in 1.3 s
  alone and timed out under full-suite load. It was failing on the baseline
  run before this session wrote a line. Re-running until green would have
  hidden it.
- **944 pytest / 686 vitest, both green as `final-full`.** Seat cost
  (D208): 53,419 in / 12,678 out to gpt-5-6-sol over three rounds; round 2
  cost 23% of round 1 while carrying three rebuttals as well as the fix
  delta.

### Session 31, still current

- **Session 31 is closed `VERIFIED`** — **1 round** (gpt-5-6-sol over the
  API), three minor findings and nothing blocking; the only session of the
  port so far to be verified on the first pass. Claude Code /
  claude-opus-5[1m] orchestrator. All five gates passed at the first
  attempt; nothing was forced.
- **The lifecycle is ported whole, and `cli/session.ts` refuses nothing.**
  `plan`, `close` (with `--dry-run` and `--force`), `cancel`, `restore` and
  `migrate` join the four writers session 26 landed, and `dabbler progress`
  and `dabbler modules` are verbs for the first time. Four modules,
  3,103 Python lines: `gates` (421), `session` (1,386), `progress` (1,050)
  and `modules` (246). The suite went 498 → **614**.
- **`gates` went first, as the session plan insisted, and the instruction
  paid for itself in a way that has nothing to do with the gates' logic**
  (D197). Almost everything `gates` emits is prose an operator reads when a
  close is refused, and a translation loses four things silently: em dashes
  (three of the five remediations carry one), Python's `repr` on a branch
  name and a verdict token, Python's `str` on `None`, and `int()` over
  `git rev-list --count`, which is `0` for anything non-integer rather than
  `NaN`. The first `close --dry-run` comparison was byte-identical, which
  fixed the wording as a fixed point before 2,700 more lines were written
  against it. `pythonStr` moved to `pythonJson.ts` beside `pythonRepr`
  (three modules now need it), and `writers.validateAndWriteState` is
  exported so `cancel`, `restore` and `migrate` land a record the way a
  registration does rather than through a second write path.
- **The import graph ran the wrong way once, and the answer is a refusal
  rather than a guess** (D198). `progress.build_task_rows` reads
  `approved-plan.json` through `approved_plan`, which is **session 32's**
  module — and porting its read half meant pulling ~250 of its 590 lines
  (the integrity check, the amendment fold, the risk-flag derivation, which
  itself reads `docs/modules.yaml`) into a session already carrying 3,103.
  Rendering an empty task list until then was the option that had to be
  refused: the projection would say "this session has no tasks" over a
  session that has seven, in the one field the Work Explorer renders as a
  list of what to do next, and no corpus shape carries a plan for the
  control to catch it. So `progress` declares an `ApprovedPlanReader` seam —
  the same shape `writers.usePlanParser` already uses — and, unregistered,
  `buildTaskRows` throws the moment a plan file exists. `buildProjection`
  already had the field for that answer: `tasksRefused`, beside an empty
  `tasks`. **Session 32 registers the real reader.**
- **`modules` has one subcommand on both sides, so the contract lost two**
  (D199, discharging D152 under D162's ruling). `ModuleVerbs.list` and
  `.retire` — and `ModuleRetireOptions` — are trimmed rather than stubbed:
  the manifest is create-only by design, and two of the extension's
  `refuse()` stubs existed only to satisfy an interface. They are gone. The
  read surface (`loadEntries`, `findEntry`, `parseEntries`) is ported whole
  even though no ported verb calls it yet, because `approved_plan` is its
  caller in session 32 and a module's readers are the module.
- **The first ported verb that writes YAML, and it is compared** (D200).
  `docs/modules.yaml` joins the compared paths — the one compared path
  people also edit by hand — because both routers rewrite the whole file on
  every `create`, and two emitters that disagreed would make every later
  diff of a tracked file carry noise nobody could attribute. Four options
  reach the `yaml` package to PyYAML: sequences at their key's indent,
  single quotes, fold width **81** (PyYAML's `best_width` is 80 and it
  allows the break past it), and **`version: "1.1"`** — the one that is easy
  to miss, because YAML 1.1 resolves `yes`/`no`/`on` as booleans and quotes
  them where the 1.2 core schema leaves them plain. **Two inputs still emit
  differently and are recorded rather than papered over**: a scalar of
  exactly `y` or `n`, and a value carrying a newline. Both are legal YAML
  for the same value; closing them means writing a PyYAML-compatible
  emitter, which is a session, not a port's side effect, and it is moot at
  the cutover.
- **The parity control gained a `setup`, and it is cheaper than a shape**
  (D201). `restore`'s only write path needs a cancelled session, and no
  built shape carries one — a shape is a lifecycle position and "cancelled
  then restored" is a transition. A case may now declare one `python -m`
  invocation run on **both** copies before the compared verb. It costs the
  control nothing it did not already trust: the corpus is built by driving
  the Python router, and this is one more of those invocations, made at case
  time. D176 had already priced the alternative — a sixth shape is the
  expensive thing.
- **Ten cases in, 28 total, 137 paths, still green.** `session plan` and
  `modules create` on `fresh`; `close --dry-run` on both shapes; `close` on
  `in-flight` (the rows, then the refusal, and nothing landed on either
  side); `cancel --force` and `restore` on `in-flight`; `progress --json` on
  both shapes and `progress` with no flag on `fresh`, which is what *proves*
  the flag is inert rather than asserting it. **`session migrate` gets no
  case**, and that is a corpus gap rather than a divergence: every built
  shape is post-collapse, so there is no legacy set directory to read.
- **`resolveSessionOrchestratorIdentity` landed as D164 planned** (D202): a
  wrapper over the block-level resolver, reading the record through
  `progress` rather than opening `sessions.json` a second time. Five tests
  cover it — the three selection branches and the two refusals — where the
  Python suite has none, which is the one place this session deliberately
  goes past its twin, and it is safe because it adds tests rather than
  behaviour.
- **A `progress --json` comparison against this repository's own 31-session
  ledger was byte-identical** on the first run, timestamp aside. That is the
  hardest single input either router has been handed — real rounds, real
  agency logs, real verdicts, a healed title — and it agreed before the
  corpus did.

### Session 30, still current

- **Session 30 is closed `VERIFIED`** — 3 rounds (gpt-5-6-sol over the API).
  Round 1 raised one Major; it was **accepted and fixed**. Round 2 restated
  it on a narrower claim; that one was **disputed and withdrawn** in round 3.
  Claude Code / claude-opus-5[1m] orchestrator. All five gates passed at the
  first attempt; nothing was forced.
- **The seat's dispatch state machine is ported whole**, and `route`'s
  `copilot-cli` branch stops refusing itself by name — the refusal that
  `route.test.ts` asserted against session 30 is gone, replaced by five tests
  of the real branch. Spawn under a deadline, first-byte and total timeouts,
  the temp-file pull above 24,000 rendered units with its nonce footer and
  acknowledgement, the stderr taxonomy, and an unreadable catalog that stops
  dispatch instead of falling back to the API.
- **Two shape differences, both forced, neither in the record.** Python's two
  reader threads and their queue become one line pump feeding the same queue,
  because there is one thread; and `dispatch` is async, which is what `route`
  already expected. **The measurement is not allowed to differ**, so
  `subprocess.list2cmdline` is ported literally — trailing-backslash doubling
  included — because the inline-vs-handoff branch is chosen from its length,
  and a different number would send the two routers down different paths for
  the same prompt.
- **The catalog gained its writer, and a verb with it.** `dabbler copilot
  refresh` (D190): the absence of a refresh command IS the incident this
  record's design turns on, and a cutover that left the seat catalog
  unrefreshable from the router that dispatches off it would recreate it.
  `REFRESH_COMMAND` still names the **Python** invocation on purpose — both
  routers print that string and the control compares it — and re-pointing it
  is owed to the cutover.
- **Round 1's Major was a divergence, not just a bug.** `resolveProgram`
  walked PATH the way `cmd` and `where` do, so `copilot` resolved to the
  `.BAT` shim VS Code installs ahead of the WinGet `.EXE`. A shim can only be
  run by `cmd.exe`, whose command line stops at **8,191** where
  `CreateProcess` allows 32,767 — and the handoff only starts at 24,000, so
  every prompt in between would have failed before the CLI ran. Python found
  the executable; this router found the shim. Resolution now prefers an
  executable anywhere on PATH to a shim nearer the front, which is
  `CreateProcess`'s rule and the one `subprocess` follows (D195).
- **Round 2 asked for shim parsing and was refused (D196).** D174 had
  already measured and rejected it, and this shim has no executable target to
  find: `copilot.bat` is `@echo off` plus `powershell -ExecutionPolicy Bypass
  -File …\copilot.ps1 %*`. The residual — a machine with only a shim — is
  bounded identically on **both** routers, so fixing it on one side would be
  a capability divergence introduced by a port. **Every round ran with
  `agency: none`**, which is why the dispute cited file and line rather than
  asserting.
- **`seat_cost` is ported on `node:sqlite`**, `readOnly` (which is `mode=ro`);
  the WAL is read and `immutable` is not used, because `immutable` is what
  skips the WAL and undercounts a live store by ~7%. It is **fetched with
  `process.getBuiltinModule`, not imported** (D192): `node:sqlite` is absent
  from `module.builtinModules`, so resolvers strip the prefix and hunt for a
  package called `sqlite`. That answer needed no build config and no
  test-runner config; the `vitest.config.ts` written along the way was
  deleted.
- **The live seat probe reached the real CLI and the seat refused for quota
  (D193).** It spawned the actual `copilot`, measured 31,673 rendered units,
  took the **handoff** branch, wrote a 31 KB payload and dispatched — then
  got `You have exceeded your monthly quota`, which the taxonomy classified
  `quota-rate-class` from real stderr. **The ack-validated half of step 5 is
  therefore unproven** and is owed to a run after the quota resets; the test
  is committed behind `DABBLER_E2E=1`. A real failure is not nothing: no fake
  spawner could have produced it.
- **Seat cost is measured, and it is its own acceptance test.** The failed
  turn still cost credits, and both routers priced the same conversation
  against the CLI's live store identically — `measured`, **9.197 credits /
  $0.0920** over one event — agreeing with each other and with the CLI's own
  reported 9.2.
- **Parity: 18 cases, two of them new, all identical.** `seat-cost` enters
  with a **floor** case and an **unmeasured** case, over a canned
  `session-store.db` the corpus writes. The seat catalog's **write** does not
  enter and cannot: a refresh must probe, and a probe is a billed premium
  request per model. `copilot refresh --dry-run` spends nothing, was run both
  ways and is byte-identical — but Python's `python -m` path prints a runpy
  `RuntimeWarning` to stderr, which the control compares. It becomes
  comparable for free at the cutover (D194).


### Session 29, still current

- **Session 29 is closed `VERIFIED`** — 2 rounds (gpt-5-6-sol over the
  API). Round 1 raised one Major; it was **accepted and fixed**, not
  disputed, and round 2 was clean but for three nits describing one race.
  Claude Code / claude-opus-5[1m] orchestrator. All five gates passed at the
  first attempt; nothing was forced.
- **D173 and D185 are closed by one ruling (D187).** Both were the same
  complaint: the two routers wrote a different string into a record for the
  same event, because the string was the name of whichever library did the
  work. Both are now framework-owned vocabulary. This is a **record change,
  not a port session** — no module was translated, and both halves landed in
  Python first.
- **A failed enumeration has eight names and the list is CLOSED.** `timeout`,
  `network-error`, `http-error`, `parse-error` and `unknown-error` join the
  three the field already carried. An unmapped failure becomes
  `unknown-error` rather than contributing its class name: an open mapping
  breaks the byte comparison the first time either library raises something
  unanticipated — silently, in a committed file, on whichever machine hit it
  first. **The original class name is written nowhere**, because a second
  field would recreate the problem and excluding it from comparison would put
  a value in the record that nothing checks.
- **Timeout and unreachable stay apart**, against one advisor's suggestion to
  merge them into a single transport term. The remedies differ — raise the
  ceiling, or fix the URL — and a field whose whole job is to say why the
  entries are stale should not collapse "your ceiling is too low" into "your
  address is wrong".
- **Each side reads its own library's bases, not a list of leaf classes.**
  `httpx.TimeoutException` / `HTTPStatusError` / `TransportError` in Python;
  in TypeScript the two classes `transports/api` raises, plus an unwrap of
  Node's `cause` chain — because Node reports a refused connection as a
  `TypeError` whose cause carries `ECONNREFUSED`. A new leaf class in either
  library keeps working.
- **`run_absence_search` stamps `dabbler-absence-search/1` in both routers.**
  The field's job is not to name a regex engine but to overwrite what the
  reviewer claimed: a worker can say it searched and report a number, and
  this function re-runs the search and stamps its own answer. Naming an
  engine never did that job. It also ends an instability nobody had noticed —
  the Python value embedded the interpreter's PATCH version, so it moved on a
  `3.11.9` → `3.11.10` upgrade, inside one router, with no engine change.
- **Round 1's Major caught a green control that proved nothing, and it is
  the session's most useful output.** The parity case built to prove the new
  vocabulary pointed at `http://127.0.0.1:1`. Port 1 is on the WHATWG
  bad-port list: Node's `fetch` rejects it with `bad port` **before opening a
  socket**, while httpx dialled it and was refused. So the case compared a
  refused connection against a rejected URL and passed — the TypeScript
  classifier reached `network-error` through its `fetch failed` fallback
  rather than through a real transport failure. **A control that agrees for
  different reasons is worse than no control, because it reads as proof.**
  No test in either router would have caught it.
- **The corpus now allocates the port rather than picking one.** It binds
  port 0, reads back what the OS assigned, releases it and uses that —
  never a bad-port number, and never a port something might be listening on.
  `discovery.test.ts` asserts `ECONNREFUSED` in the failure chain **before**
  asserting the vocabulary term, and a second test pins `fetch`'s bad-port
  refusal from the other side, so the substitution cannot recur unnoticed.
- **The `enumerate` parity case now covers both halves of the field.** One
  vendor keeps a fake key and the closed-port base URL; the other two still
  fail at `no-api-key`. Both routers must write the same word for each, and
  the two records differ only in their timestamps and the digest over them —
  which is what normalization already handles. Still 16 cases over 85 paths.
- **Session 29 was inserted, and it cost a renumber (D188).** The lifecycle
  derives the next session from the completed ones, so it refuses an
  out-of-order number; inserting one meant moving Transport II to 30, the
  cutover to 36, and 38 lines of live guidance across 15 files. The
  append-only log and this file's older sections were deliberately left
  alone — see the note above. **Worth knowing for the next insertion:
  register, declare, *then* renumber** — `declare` refused the first attempt
  because the tree already carried 15 changes, and it was right to.
- **A future enhancement is recorded rather than built**, in
  `docs/operator-decisions.md`: session numbers should become insertable, so
  a session between 28 and 29 costs nothing. Two caveats went with it —
  **store it as a string or scaled integer, never a language float** (neither
  TypeScript nor Python has a native decimal type, and Python already writes
  `29.0` where JavaScript writes `29`, which is why `PythonFloat` exists);
  and **wait until the port leaves one implementation**, because a behaviour
  change made on both sides at once is the one thing parity cannot see.
- **Seat cost: 18,839 in / 6,570 out to gpt-5-6-sol over two rounds
  (D189).** The cheapest session of the port by a factor of two — the running
  total across seven is 537,282 verifier tokens, and the next cheapest is
  session 24 at 61,855. That is not a better process; it is a 200-line diff
  instead of a 2,276-line port, and the round-1 prompt is sized by the diff.
  Round 2 is 55% of round 1, the highest ratio recorded, which also means
  nothing: it is a fraction of a small denominator. In absolute terms round 2
  cost 6,666 tokens, the smallest verification round of the port.
- **One measurement the series has never covered.** The advisory consult
  that precedes a ruling — `gpt-5-6-sol` and `gemini-3-1-pro`, per the
  operator's standing directive — leaves no row in `router-metrics.jsonl`.
  Every seat-cost decision in this port measures verification only, so the
  series is comparable but incomplete.
- **Suite: 944 Python (5:45) / 391 router vitest (51 s, plus 3 live tests
  skipped) / 153 extension mocha / 14 Playwright; all four declared controls
  green.** Python test counts unchanged; vitest gained two.
- **Left deliberately.** Round 2's surviving nit is a time-of-check/
  time-of-use race: between releasing the allocated port and the routers
  connecting, another process could bind it, and both routers would then
  agree about whatever they found. The window is microseconds against an
  ephemeral range, the failure is loud (a 200 where a refusal was expected,
  in a control that diffs bytes), and the alternative is retry machinery in
  a corpus builder.

- **Session 28 is closed `VERIFIED`** — 2 rounds (gpt-5-6-sol over the
  API). Round 1 raised one Major and three nits; the Major was **disputed
  and withdrawn**, and round 2 was clean. Claude Code / claude-opus-5[1m]
  orchestrator. All five gates passed at the first attempt; nothing was
  forced.
- **Six modules are ported.** `transports/base` (49), `transports/offline`
  (140), `transports/api` (292), `selection` (146), `route` (592) and
  `discovery` (1,057) — 2,276 Python lines becoming **2,879 TypeScript
  across seven files**, plus the `discovery` verb, with **90 vitest tests**
  answering for the 82 Python ones. `transports/copilot.ts` grew by 171
  lines: the seat catalog's READER.
- **`fetch` replaces `httpx`, which makes `route` async (D180)** — and that
  is the whole of the shape difference. Neither a promise nor a child
  process has a blocking form under Node, and a synchronous facade over
  either would stall the only thread there is; `checks.execute` took the
  same shape in session 27 (D174), and these are the last two. **The rate
  limiter's `threading.Lock` survives as a promise chain rather than being
  dropped as a Python artefact**: Node has one thread and the same hazard,
  and two awaited `wait()` calls would otherwise both pass the ceiling.
- **Two branches of `route` are refused BY NAME (D181), not skipped.** The
  `copilot-cli` transport names session 29; the auto-verification tail — a
  live branch, since the bundled config auto-verifies `code-review` — names
  session 31. A silent fallback to the API would put a cross-provider
  verification on the provider the operator was routing away from, and a
  dropped auto-verify would return an unverified result that reads as
  verified. Everything up to those two branches is real: prompt rendering
  and the over-budget refusal, the escalation triggers, the truncation
  heuristic, the exclusion assertion at the call site, the metrics row, and
  the whole API and offline paths. **The seat's half of selection is real
  too**, so session 29 inherits a transport to write rather than a rule to
  restate.
- **The parity control compares a lock-file WRITE, on 16 cases over 85
  paths (D182).** Four `discovery` cases on `fresh`: `status`, `drift`,
  `enumerate --dry-run` and `enumerate`. The specification excluded
  `enumerate` as needing the network — true on a machine with keys, so
  **the corpus takes the keys away**. Every vendor then fails `no-api-key`
  before a socket opens and both routers fold that identical failure into
  the same record, byte for byte including the writer stamp and the digest.
  The scrub is load-bearing on its own: without it every parity run on the
  operator's machine would spend three vendor calls per shape.
  `.dabbler/api-models.lock` joins the compared paths and **names itself as
  the second digest-over-a-timestamp**, as the specification requires.
- **One compared line is wall-clock-derived and no normalization reaches
  it.** Three of the four cases print a record's age as `f"{h:.0f}h old"`
  from each router's own `now`, about a second apart. They disagree only
  when that second straddles a rounding boundary — roughly one run in two
  thousand — and the diff then reads `5713h old` against `5714h old`, which
  re-running settles. Recorded rather than fixed: a third normalization is
  forbidden, and a `--now` flag would be a CLI knob invented for the
  control's convenience.
- **Two debts session 26 left by name are closed (D183).** `session start`
  emits its discovery warnings through the same fail-silent wrapper Python
  uses — a staleness check that could fail a registration would be a
  maintenance signal capable of causing an outage. And the seat lock file
  now has **one parser**: `identity`'s lenient reader collapsed into a
  wrapper over the real `loadCatalog`, which closed a latent divergence
  nobody had noticed — the old reader used the good entries of a malformed
  lock where Python resolves nothing.
- **The ported transport reaches all three vendors live (D184).**
  anthropic 1.3 s, openai 2.0 s, google 0.7 s, in `test/live.test.ts`,
  gated on `DABBLER_E2E=1` and skipped by the default run — an explicit
  opt-in rather than "are there keys here", because a developer with keys
  set must not discover that `npm test` spends money. OpenAI served
  `gpt-5.4-2026-03-05` for `gpt-5.4`, so the served-model notice fired
  against a real body rather than a canned one.
- **The disputed Major was wrong about which module writes what, and the
  rebuttal cost 3,400 tokens.** It read the plan's "`discovery` reads and
  writes `copilot-catalog.lock`" literally; but `ai_router.discovery` never
  writes that file (all four of its seat references are reads), its writer
  is in `transports/copilot.py`, and a refresh is *defined* as an empirical
  probe — so porting it would have pulled session 29's dispatch state
  machine into session 28. A writer without the probe could only mark a
  model `confirmed` with no evidence, which that file's own design forbids.
  The verifier withdrew on the first reading of the cited lines.
- **One nit was a real defect and is fixed with a test.** A Gemini 200 with
  no candidate — what a safety block returns — became the literal string
  `"undefined"` and would have passed every escalation trigger as an
  answer. Python indexes and raises, so the port now raises: an empty
  string would have been just as wrong, converting a blocked response into
  an escalation the record cannot tell from a model that answered with
  nothing. The same coercion in the Anthropic caller was fixed with it. Two
  other nits described Python's behaviour faithfully ported and were
  answered with a docstring rather than a change — `DispatchError`'s claim
  to cover exhausted API retries overstates what *either* router does.
- **A second D173-shaped question is owed a ruling (D185).** A failed
  vendor's recorded `last_error` is the failing library's own class name,
  so the routers write `TimeoutException` and `HttpTimeoutError` into
  `.dabbler/api-models.lock` for the same failure. Every byte difference
  before these two was settled in Python's favour (D165) because each was
  *formatting*; both of these are content. The parity corpus cannot see it
  — with no keys every vendor fails as the shared `no-api-key` constant.
  **Session 35 is the deadline for both**: after it one router remains and
  whichever string it writes becomes the answer by default rather than by
  decision.
- **Seat cost: 60,448 in / 10,443 out to gpt-5-6-sol over two rounds
  (D186).** Round 2 is **18%** of round 1's input, against 26% at session
  26 and 8% at 27. Six ported sessions have now spent 511,873 verifier
  tokens; session 28 is the third cheapest of them while being the second
  largest by Python lines ported.
- **Suite: 944 Python (5:58) / 389 router vitest (47 s, plus 3 live tests
  skipped) / 153 extension mocha / 14 Playwright; all four declared
  controls green.** Python test counts unchanged. `packages/router` is
  ~14,500 lines of source (1,572 generated) and ~5,500 of tests.
- **Left for whoever needs it, deliberately.** Round 2's surviving nit says
  the Gemini reader takes `parts[0]` only — which is exactly what Python
  does, so a multipart response truncates in both routers identically. It
  is Python's behaviour, not the port's. Separately, `pytest.ini` declares
  the `e2e` marker as excluded from the default run but `addopts` carries
  no `-m "not e2e"`; nothing is wrong today because no Python e2e test
  exists, and adding one without that flag would put live vendor calls into
  the run of record.

- **Session 27 is closed `VERIFIED`** — 3 rounds (gpt-5-6-sol over the API).
  Round 1 raised four Major findings; **three were disputed and all three
  withdrawn**, and the fourth was accepted and fixed by *deleting* the
  function rather than repairing it. Round 2 raised one Major against that
  deletion; **disputed and withdrawn**. Round 3 was clean. Claude Code /
  claude-opus-5[1m] orchestrator. All five gates passed at the first attempt;
  nothing was forced.
- **Four modules are ported.** `evidence` (902), `checks` (1,001),
  `test_evidence` (815) and `affected` (575) — 3,293 Python lines becoming
  **4,159 TypeScript across six files**, plus two verb handlers, with **93
  vitest tests**. `evidence.ts` grew from session 26's 208-line slice to
  1,137; `checks.ts` is 1,306, the largest file in the package.
- **`affected` and `test-evidence` are real verbs, and both entered the
  parity control in the session that ported them** — the first time since 25
  that a session needed no forward dependency and no new fixture. Both
  already had a Python command line and both were already in the `in-flight`
  corpus builder, so the three new cases run against a shape the control was
  already building.
- **Twelve cases, and the control got FASTER: 90.7 s against ~150 s at nine
  (D176).** A new *case* on an existing shape is nearly free — the corpus
  build dominates and the new cases share it. A new *shape* is not, and
  sessions 28 and 32 add three. That is the amendment to D169's warning: the
  thing to watch is shapes, not cases.
- **Both digests are byte-identical across the routers.** The
  `preverify-targeted` case compares the covered-surface fold — sorted
  (path, content-hash) pairs, with the session's own bookkeeping and the run
  ledger left out; the `final-full` case compares the whole-tree fold the run
  of record binds to. `--duration-seconds 42` had to be written `42.0` by
  both, which is `PythonFloat` earning its keep in the first row either
  router appends.
- **Both routers snapshot this repository's live worktree to the same git
  tree id (D177).** `b6d8e262…` from each, over ~2,000 tracked and untracked
  files through a throwaway index. The plan asked for `completion_tree`
  parity; the control cannot compare one until a verb writes a round, which
  is `verify` in session 32 — so this is **evidence, not a control**, taken
  the way session 25 took `verdict`'s (D163).
- **Windows spawning is where Node and Python actually differ, and it is
  measured (D174).** `spawn("x.cmd", …)` is `EINVAL` on Node where Python
  appears to run the batch file directly — it does not: `CreateProcess`
  wraps a batch file in `cmd.exe /c`, so **both routers pay cmd's parsing on
  exactly these programs**. The port hands the shim to `%COMSPEC% /d /s
  /v:off /c` with each argument quoted itself, never `shell: true`, which
  would let a shell re-split a line the module built. An over-long command
  line is `ENAMETOOLONG` (libuv's mapping of Windows error 206, the same one
  Python's Copilot classifier reads), it is **thrown rather than emitted**,
  and `checks.isArgvTooLarge` is the one reader of it for session 29 to
  import. `execute` is async and takes no run id: the heartbeat it wrote is
  a run-core file (D130).
- **`checks.plan` is deliberately NOT ported (D178).** Round 1 found that it
  appends the whole selection to every suite's command where `forSuite`
  exists to prevent exactly that. Its only callers are `runcli.py:400` and
  `runcli.py:814` — measured — and the run core is deleted in session 34, so
  the repair is deletion: fixing it would have put a narrowing rule in the
  TypeScript router that Python lacks, in a function neither router calls.
  `CheckPlan`, `changedPathsFor`, `targetedSuiteCommand`, the four
  `FULL_ALLOWED_*` constants and `selectionUnknownPaths` went with it. This
  is the same cut D129 made for `journal` and `verifyjob`. **The per-suite
  guarantee still exists where it is reachable**, in
  `affected.runnableCommands` and `preverifyGate`, and is tested against a
  two-suite repository.
- **One deliberate record difference, owed a ruling (D173).**
  `run_absence_search` stamps the regex engine that produced the count;
  Python writes `python-re/<version>`, the port writes `node-regexp/<node>`.
  Every other cross-language byte difference was settled in Python's favour
  (D165) because each was a *formatting* choice; this one is content, on the
  one row whose purpose is provenance, and the engines genuinely differ.
  Nothing reaches it today.
- **Three of round 1's four findings described Python's behaviour faithfully
  ported, and two named functions with NO CALLER in either router.**
  `validate_transcript`, `validate_finding_evidence`, `authoritative_tier`,
  `verify_worker_result` and `record_worker_result` are library surface the
  critique pipeline would drive, and it defaults to `off`. The verifier
  withdrew all three on that basis. What the commits added instead is the
  limit stated in each docstring, so no later reader assumes a guarantee
  that is not there.
- **Where Python states a rule twice, the port states it once (D175).**
  `pythonRepr` was about to have six copies; it now lives in `pythonJson.ts`
  beside `dumps`, `progress.ts` re-exports it and `critique.ts`'s private
  copy is deleted. `normaliseRel`/`matchingPrefixes` are stated once where
  Python carries byte-identical copies in `checks` and `test_evidence`.
  `gates`'s glob matcher is deliberately not shared: it is case-insensitive
  and `checks`'s is not.
- **Seat cost: 82,021 in / 16,256 out to gpt-5-6-sol over three rounds
  (D179).** Round 2 is 26% of round 1's input and round 3 is 8% — **a third
  round spent on a dispute is close to free**, which is the argument for
  writing the rebuttal out rather than remediating on reflex.
- **Suite: 944 Python (7:09) / 299 router vitest (50 s) / 153 extension
  mocha / 14 Playwright; all four declared controls green.** Test counts
  unchanged on the Python side. `packages/router` is ~11,600 lines of source
  (1,572 generated) and ~3,900 of tests.

- **Session 26 is closed `VERIFIED`** — 2 rounds (gpt-5.6-sol over the API).
  Round 1 raised two Major findings; **both were disputed and both were
  withdrawn**, and round 2 was clean. Claude Code / claude-opus-5[1m]
  orchestrator. All five gates passed at the first attempt; nothing was
  forced.
- **The record is ported.** `ledger` (901), `writers` (881) and `journal`'s
  surviving slice (~150) became **~4,000 TypeScript lines across ten
  files**, with **74 vitest tests**. Everything under `.dabbler/runs/` and
  `docs/sessions/` is written there and nowhere else.
- **D129 sized this session at three modules; it is nine (D171).**
  `writers` cannot be ported alone. It imports `progress` (session 30) for
  the status vocabulary, the derived view and the invariants it folds a
  state through before writing it; `evidence` (session 27) for the
  filenames at the sessions root and the digest ledger every sanctioned
  write appends to; and `gates` (session 30) for the working-tree question
  the declaration refuses on. Each is ported as a named slice in a file
  named for its Python module — 302 Python lines in all — the way session
  25 ported `transports/copilot`'s timeout slice. Porting the writer
  without the reader would put a second statement of what a legal record is
  inside the module that produces them.
- **`session start` / `declare` / `log` / `decision` are real; the rest of
  the verb is refused by name.** Nothing `writers` writes is reachable
  except through those four, so without them ~4,000 ported lines would have
  entered no comparison at all. `contracts/verbs.ts` moves `session` to
  `portedInSession: 26`; `cli/session.ts` refuses `close`, `cancel`,
  `restore`, `plan` and `migrate` and names session 30. **Session 30 keeps
  the lifecycle's judgment half** — the five gates, the boundary reversals,
  the legacy migration — and its scope is unchanged by this.
- **The parity control compares nine verb cases over 45 paths**, up from
  one: `metrics`, `session start` (fresh + in-flight), `declare` (fresh),
  the already-declared **refusal** (in-flight), `log` (in-flight) and
  `decision` (both shapes). The refusal case is deliberate — a refusal's
  wording is what the operator reads, and it exercises a branch no passing
  case reaches.
- **It found a real defect on its first run, in the one row it had just
  appended.** Python's `open(path, "a", encoding="utf-8")` takes the
  platform default newline, so on Windows every `.dabbler/runs/` JSONL row,
  `sessions.json` and the activity log carry CRLF — while the files opened
  with `newline=""` or `newline="\n"` carry LF. Node writes the bytes it is
  given. The rule is **per file**, and getting it wrong in either direction
  is drift: `journal.platformNewlines` is the one seam, and every writer
  whose Python twin takes the default goes through it.
- **Two seams earned their existence by making other files smaller.**
  `pythonJson.ts` is `json.dumps`: the `", "` separator, `ensure_ascii`
  (including DEL, which is ASCII and which CPython still escapes), the
  astral surrogate pair, and CPython's float `repr` — which moved here out
  of `lockfile.ts`, so the seat catalog's TOML, the metrics ledger and every
  record row now get one answer. It was **checked against CPython over 13
  shapes × 3 modes: all 39 identical**. `schema/validate.ts` is the ajv
  wrapper `config.ts` had privately; the error *location* matches Python's
  `jsonschema`, the error *wording* is explicitly not claimed (D165).
- **D160 is discharged (D170).** `test_evidence.surface_digest` omits an
  unreadable path instead of hashing the literal word `"deleted"`, so a
  deletion moves the freshness digest once — when the file goes — and the
  commit that records it moves nothing. It is its own commit, as the
  control's sequencing rules require, and it rode in the working tree
  rather than landing before the session, so the verifier saw a change to a
  gate. **The trap in `AGENTS.md` is now history rather than a warning.**
- **The corpus declares both discovery records fresh.** `session start`
  warns for every discovery record that is absent, undated or overdue, and
  an absent one is stale whatever the threshold says — so a corpus without
  them would make every registration comparison a comparison of
  `discovery`, which lands in session 28. `.dabbler/api-models.lock` is
  written with a fixed date and the overlay puts both thresholds past any
  age they can reach. That second half matters on its own: the checked-in
  seat catalog is dated 2026-08-19 against a 720 h threshold, so **without
  it the control would have turned red around 2026-09-18** for a reason no
  diff of the change would explain.
- **Round 1's two findings were both real questions and both correctly
  disputed.** The first said malformed `sessions.json` is silently replaced
  rather than refused — true, and it is *Python's* behaviour
  (`progress.py:441-452`, `writers.py:398-414`); making TypeScript refuse
  would have turned the control red, and the specification forbids that
  repair in as many words. The second asked for a round-append parity case
  — unreachable, because `ledger` has no Python command line and the only
  verb that appends a round is `verify`, at session 32 on shapes with no
  builder until 28. Both halves that *were* actionable were fixed: an
  `existsSync` probe that turned a deleted-file race into a throw where
  Python returns null, and six direct tests over `appendRound` including
  the anchor. **The disputes cost 11,590 tokens and settled both.**
- **Suite: 944 Python (5:28) / 207 router vitest (18 s) / 153 extension
  mocha / 14 Playwright; all four declared controls green.** The Python
  suite gained one test (D170's). `packages/router` is now ~7,400 lines of
  source (1,400 generated) and ~2,100 of tests.

- **Session 25 is closed `VERIFIED`** — 2 rounds (gpt-5-6-sol over the
  API), round 1 blocking and correct, round 2 clean on the fix delta. Claude
  Code / claude-opus-5[1m] orchestrator. All five gates passed at the first
  attempt; nothing was forced.
- **Seven modules are ported.** `config`, `secret_resolver`, `identity`,
  `verdict`, `lockfile`, `runtime_mode`, `metrics` — 1,841 Python lines
  becoming **2,790 TypeScript across fourteen files**, with **122 vitest
  tests** answering for the 98 Python tests. The extra files are the seams:
  `paths`, `textfile`, `version`, `cli/output`, and the two forward
  dependencies (below).
- **Both routers read ONE copy of the bundled data.** `router-config.yaml`,
  the schemas and the prompt templates are read from `ai_router/` by both,
  resolved through `src/paths.ts`, which finds the package by walking up for
  its own `package.json` — the same code runs from `src/` under ts-node and
  from `dist/` after esbuild, and a fixed number of `..` would be silently
  wrong in one. A second copy of that data would drift, and the control
  compares two routers reading the same input. Session 33/35 decides what
  the package ships with when Python leaves.
- **`metrics` is the first verb the port makes real**, and the parity
  control's **first cross-router case** — a session earlier than D159
  assumed, because `contracts/verbs.ts` has said `metrics` lands in session
  25 since it was written. Both routers produce byte-identical stdout,
  stderr and exit code on `fresh` and `in-flight` (**D163**).
- **Landing one verb found two defects six more library ports would not
  have (D166).** `python -m ai_router.metrics` printed a runpy
  `RuntimeWarning` on *every* invocation, because `__init__` imports
  `route` and `route` imported `metrics` at module scope; `route` now
  imports `record_call` inside the one function that calls it, which is how
  `verifyjob` already reached it. And **session 23's bundled `dabbler.cjs`
  died on its first line**: esbuild's CommonJS output has no
  `import.meta`, so any module locating itself by it resolved `undefined`.
  Nothing had noticed because no verb was implemented, so nothing in the
  bundle had ever read a file. `build.mjs` now defines it from `__filename`.
- **`config` load enters the control through `metrics`; `verdict` parse
  could not.** `verdict` has no command line and is reached only through
  `verify` (session 32), so its case lands there. It was proved instead
  against **every verifier output this repository holds — 71 files, three
  vendors — parsed by both implementations and compared structurally:
  identical on all 71** (**D163**). That is evidence, not a control.
- **Four cross-language byte differences are settled in Python's favour
  (D165):** line endings in both directions (`cli/output.ts` writes the
  platform's ending because Python's `print` does; `textfile.ts` reads
  universal newlines because Python's text mode does, and the TOML reader
  deliberately does not, because `tomllib` takes bytes); `int` versus
  `float` via a `tomlFloat` marker; CPython's float `repr`; and
  `json.dumps`'s separators and non-ASCII escaping. **Schema error
  *wording* is explicitly not claimed** — `ajv` and `jsonschema` word and
  order errors differently, and matching them would be a second
  implementation of a rule.
- **Both owed rulings with a deadline here are discharged.** **D159**: session
  23's step 5 is reworded. **D161**: `facts.run_control` now keeps a passing
  control's own output in the record, and a silent control records that it
  was silent — with each parity case declaring, in the type system, what a
  green row for it proves (**D167**).
- **Round 1's finding was real and is the reason to keep the loop.** The
  control claimed a "three-layer config load" the corpus never exercised:
  there was no `local-overrides.yaml` in it. That is D161's own failure mode
  arriving in the session that implemented D161. The corpus now carries one,
  written per repository and **load-bearing rather than scenery** — it is
  what points `metrics` at the canned telemetry, so with it the report reads
  4 calls and without it 110. The corpus also scrubs `AI_ROUTER_CONFIG`,
  `AI_ROUTER_METRICS_PATH`, `DABBLER_TRANSPORT` and `DABBLER_NO_ROUTER` from
  the child environment: an operator with the first one set would have made
  both routers read their config and skip both layers, wrong together, which
  is the one failure a comparison cannot see.
- **Suite: 943 Python (5:12 at `-n 2`) / 133 router vitest (6 s) / 153
  extension mocha / 14 Playwright; all four declared controls green.** The
  Python suite gained one test (D167's). `packages/router` is now ~4,700
  lines of source (1,400 generated) and ~1,300 of tests.

- **Session 24 is closed `VERIFIED`** — 3 rounds (gpt-5-6-sol over the
  API), the round-3 finding **disputed and OVERRULED** by a third provider
  (gemini-flash/google). Claude Code / claude-opus-5[1m] orchestrator.
  **Closed through all five gates, at the second attempt.** The first
  close used `--force` to get past the freshness gate and marked sessions
  25–35 of the port plan `complete`, because `forced` promotes every open
  session — a forensic marker for abandoning a set, not a way past one
  gate. The ledger was restored from the pre-force commit, the full suite
  re-run, and the session closed normally with no `forceClosed` stamp.
  **D158** carries the whole of it, including the three framework defects
  it exposed; the traps are written into `AGENTS.md` so the next engine
  meets them before the tool.
- **The seam is in, and `src/router/` IS the Python implementation.**
  `pythonSpawnRouter` builds the argv and satisfies `Router`; `routerCli`
  runs it, echoes it and classifies the exit code; `pythonInterpreter`
  finds the interpreter; `projectionPayload` narrows what comes back;
  `host.ts` is the composition root and the only file callers import.
  Nothing outside the directory imports any of them. The one declared
  exception is `commands/bootstrapProject`, which creates a venv and
  pip-installs the router — it runs before there is a router to ask
  (**D154**). Session 35 changes one line in `host.ts`.
- **`types.ts` is deleted (D139's purpose served).** Its 209 hand-kept
  lines are the generated `ProgressProjection`, imported under the
  extension's own names by alias, so a schema change is a compile error at
  every call site. `SessionsRepository` — the extension's own row shape,
  never part of the projection — moved to `utils/fileSystem.ts`, where it
  is built.
- **The extension no longer emits TypeScript (D150).** Reading the
  router's types from source needs `allowImportingTsExtensions`, which
  TypeScript permits only under `noEmit`. Nothing consumed the emit:
  `dist/extension.js` is esbuild's, the unit suite runs the sources
  through ts-node, Playwright transpiles its own specs, CI typechecks with
  `--noEmit`. The one consumer was the `@vscode/test-electron` harness the
  extension's CHANGELOG records as broken and CI has never run;
  `src/test/runTests.ts` and `src/test/suite/index.ts` went with it.
- **The router package is importable at last (D151).** `main:
  src/index.ts` gave it no importable form — ts-node refuses to `require`
  any `.ts` under a `"type": "module"` package. `build.mjs` now emits
  `dist/index.cjs` beside `dist/dabbler.cjs`; `main` points at the bundle
  and `types` at `src/index.ts`, so a consumer type-checks against the
  source and links against the bundle with no declaration in between to go
  stale. `prepare` builds it, so `npm ci` produces it and neither CI nor a
  fresh clone needs a new step.
- **Two live defects surfaced and fixed.** `ai_router.modules create
  --title` is `required=True`, and the extension omitted it whenever an
  operator accepted the default title — New Module's likeliest path was
  sending an argparse usage error (**D153**). `troubleshoot` printed
  `python -m ai_router.report`, a module set 109 removed, beside
  per-session dollar figures the router has had no rate table to produce
  since then.
- **`PythonSpawnRouter` builds argv only for verbs read off the Python
  parser (D152).** A first pass implemented all 32 `Router` methods from
  the contract's option names, and three were wrong: `ai_router.modules`
  has exactly one subcommand (`create` — there is no `list` or `retire`),
  and `verify dispute` takes `--finding`, not `--finding-index`. The other
  twenty refuse by name. **Owed:** sessions 30/32/34 port those modules
  and should reconcile the contract rather than inherit a shape nothing
  ever ran.
- **Suite: 942 Python (5:03 at `-n 2`) / 11 router vitest / 153 extension
  mocha / 14 Playwright; all four declared controls green.** Test counts
  unchanged — no new tests, as the plan estimated. Net TypeScript in the
  extension is **+178 lines**, not the net-negative the plan estimated:
  `implements Router` requires all 32 methods, and the twenty that refuse
  still cost their signatures.

- **Sessions 22–35 are landed** in `docs/sessions/session-plan.md` (commit
  `d77a075a`, `totalSessions: 35`): the port of `ai_router` to TypeScript so
  the framework ships as one Marketplace artifact and a project holds only
  its own record — **D128**, operator. **Session 22 is closed
  `VERIFIED`** (3 rounds, gpt-5-6-sol over the API; every finding
  Minor). A prose session: Claude Code / claude-fable-5 orchestrator, no code,
  no test.
- **The inventory is decided (D129):** 38 modules ported, 4 merged, 3
  retired; 832 tests ported, 109 deleted. Three departures from the plan's
  default table, each from the import graph: `facts` is verification's
  deterministic-controls module (ported, session 31); `fixloop` and
  `testphase` are imported by the six-step `workflow` (ported, session 34);
  `journal` and `verifyjob` split — the git seam and the prompt/auto-verify
  functions are kept, their run-core halves retired. Only `runcli`,
  `runcore` and `runproject` retire outright.
- **D88 is resolved by the plan's default (D130):** the run core is retired
  and deleted in session 34. It is an orchestrator's application of an
  operator-set default; **the operator can override until session 34
  starts**, and nothing is deleted before then.
- **Runtime floor measured, not remembered (D131):** VS Code 1.135.0's
  extension host is Electron 42.8.1 / Node 24.18.1 and `node:sqlite` loads
  unflagged (`ELECTRON_RUN_AS_NODE=1 Code.exe -e …`); system Node 25.8.1
  likewise. Layout: `packages/router` (npm `dabbler-ai-router`, `bin:
  dabbler`) under root npm workspaces, esbuild bundling both into the VSIX.
  **Dependency ceiling (D132):** `yaml`, `ajv`, `smol-toml`; nothing native;
  a fourth is a decision in the log.
- **The parity control is designed (D133) and built (D141, D146):**
  `docs/ts-port-parity-control.md`, amended in three places by building it.
  It runs **two** comparisons and is red if either drifts: every corpus
  shape built twice through the Python router and compared byte for byte
  (from session 23), and every ported verb through both routers (from
  session 26). `npm run parity`, plus `--build`, `--self-check` and
  `--shapes` by hand.
- **Session 23 is closed `VERIFIED`** — 3 rounds, gpt-5-6-sol over the API,
  the third round's single finding **disputed and OVERRULED** by a third
  provider (gemini-flash/google). Claude Code / claude-opus-5 orchestrator.
  Its deliverables:
  - `packages/router` (npm `dabbler-ai-router`, `bin: dabbler`) under a
    root npm workspace with the extension; `tsc --strict`, ESLint, vitest.
    The CLI bundles to **`dist/dabbler.cjs`** — CommonJS as D131 says, but
    `.cjs`, because a `.js` under `"type": "module"` is an ES module
    whatever is inside it (**D138**).
  - **Types generated from every schema** into `packages/router/src/
    generated/`, checked in, with a `compile` control that fails when they
    are stale. A **twenty-first schema** was written — `progress --json`
    had none, and its only statement was the hand-kept `types.ts` this
    session exists to replace; it validates a real 35-session projection
    with zero errors and nothing reads it yet, so no behaviour moved
    (**D139**).
  - **The `Router` interface** — one method per verb, refusals as values
    over the published exit codes (0/3/4/other), and the schema-backed
    answers returning their generated types (`progress`,
    `approvedPlan.read`, `ledger.latestRound`). The `dabbler` verb list is
    one table; a verb is available when a handler is registered, so there
    is no session number to bump (**D140**).
  - **This repository's first declared controls**, all four kinds and all
    `required: true`: `compile` (type staleness), `typecheck`, `lint`,
    `analyzer` (parity). Green in ~16 s through `facts`. Each command is
    argv for `node`, because `facts` runs controls with no shell and
    `npm`/`npx` are shims argv cannot reach (**D142**).
  - **The `typescript` suite** declared beside `python`, with selection
    rules for every new path, so `affected` selects across both. CI
    installs at the workspace root on Node 24 and gains a `router` job.
- **The run ledger is no longer tracked (D135, operator):** `.gitignore`
  ignores `.dabbler/` whole, which is the rule `bootstrap` writes for every
  project. Rounds no longer travel between machines — a session finishes
  where it started — and the record of each session's rounds lives on the
  machine that ran it. As a side effect the selector's 208 false
  `selection_unknown` rows (D134, a latent defect kept owed at low priority)
  and the close's uncommitted-residue habit are gone from this repository.
- **Session 22's seat cost is measured (D136)** in the two currencies it
  had: the orchestrator's Claude Code context and the verifier's API tokens.
  No dollar figure — set 109 removed the rate table, and the router prices
  nothing.
- **Set 148 is complete: 21 of 21 sessions closed**, 2026-08-26 → 2026-08-28;
  19 `VERIFIED`, 2 `REMEDIATED_AT_CAP` (sessions 12 and 17, whose final fixes
  are unreviewed by construction — the D122 gap). Its acceptance is **D127**.
- **Router `dabbler-ai-router` 1.1.0** (tag `v1.1.0`); **extension 1.0.4**
  (tag `vsix-v1.0.4`). Both become 2.0.0 at cutover (session 35).
- **Suite: 942 Python (4:43 at `-n 2`) / 11 router vitest (0.8 s) / 153
  extension mocha (0.3 s); all four declared controls green.** The Python
  suite gained one test (the gate fix, D143) and about a minute, because a
  second expensive suite doubles the `git ls-files` spawns in every
  pre-verification gate call. `packages/router` is ~1,900 lines of source
  (1,400 of them generated) and ~200 of tests. `verify.py` is 2,537 lines
  and is ported as five files in session 32.

## Acceptance evaluation for set 148 — recorded as D127

Criterion met (session 20 ran end to end on the framework the set built);
check 1 (every plan item exactly once) met; check 2 (no skipped step, no
foreign verdict) met; **check 3 (seat cost measured from session 3 onward)
not met** — measured for sessions 1, 3, 4 and 5 only, and **not
back-filled** by operator decision. The step carries forward: every session
of the port plan carries "measure this session's seat cost" as a numbered
step, and session 22 executed it (D136). The full evaluation with its table
is D127; the previous version of this file carried it in full.

## Owed, from the record

| Source | What is owed |
| --- | --- |
| **D196 — the shim-only ceiling, owed to the CUTOVER** | On a machine where `copilot` resolves only to a batch shim, `cmd.exe` runs it and the command line stops at 8,191 while the handoff waits until 24,000. **Both routers are bounded identically today** — `CreateProcess` wraps a batch file in `cmd /c` — so the fix is to lower the handoff threshold on the shim path, and `HANDOFF_THRESHOLD_UTF16_UNITS` is a constant both routers must agree on or they take different branches for the same prompt. Needs a session that may touch Python; session 36 is where there stops being a second side. Named in `defaultSpawner`. |
| **D190 — `REFRESH_COMMAND`, owed to the CUTOVER** | Every message about a stale, hand-edited or same-provider catalog names `python -m ai_router.transports.copilot refresh`, and **both** routers print it, which is why it was not changed. It is true today and becomes false the moment Python is deleted. Re-point it to `dabbler copilot refresh` in session 36, in the same commit that removes the Python module it names. |
| **D193 — the seat probe's second half** | The live handoff test reached the real CLI and took the handoff branch; the seat then refused for quota, so **no model read the payload and no acknowledgement was earned**. Run `DABBLER_E2E=1 npx vitest run test/live.test.ts -t handoff` once the operator's premium-request allowance resets. One billed turn. The failure message now dumps the whole metadata, so whichever way it goes the run is readable. |
| **D194 — one int/float approximation, four readings** | JavaScript has one number type, so the port stands `Number.isInteger` in for Python's `type(x) is int`. Consequences: a wire `outputTokens: 42.0` fails closed in Python and is accepted here; a seat reporting `premiumRequests: 1.0` would be written `1` here and `1.0` there; and `toFixed` rounds half away from zero where Python's `format` rounds half to even (`seat-cost`'s credits, and `metrics`' escalation percentage since session 25). One fix covers all four — a JSON reader that keeps the lexical int/float distinction, and a shared fixed-point formatter — which is why it is one row and was not half-done in a port session. |
| **D194 — `copilot refresh --dry-run` as a parity case** | Built, run both ways, stdout byte-identical, and **not** a case: `python -m ai_router.transports.copilot` makes runpy print a `RuntimeWarning` to stderr, which the control compares. Free to add at the cutover, and worth it — it is the only reading of the scope selection and the cost projection that costs nothing. |
| ~~**D173 — the port's one record difference**~~ **CLOSED in session 29 by D187**, together with D185, which was the same shape. Both routers now stamp `dabbler-absence-search/1`, and a failed enumeration is recorded in a closed eight-term vocabulary rather than under the failing library's class name. The route taken is the one this row called sanctioned: Python changed first, and the field names the rule rather than the engine. | *Nothing further owed.* |
| **D173 / round 1 — the evidence protocol has no callers** | `validate_transcript`, `validate_finding_evidence`, `authoritative_tier`, `verify_worker_result` and `record_worker_result` are ported and **nothing in either router calls them**. Two real gaps sit inside them, both shared with Python and both recorded rather than repaired on one side: `outputHash` is not re-derived from `rawOutput`, and a check's `evidence.pass.requires` contract is not enforced when its result is recorded. The session that first drives the critique loop owns both, and the second one may belong at dispatch rather than at record — the loop's shape decides. |
| **D174 — consumer repositories** | A repository declaring `argv: ["npm", "test"]` for a check works under Python and would not have under the port without the shim resolution this session added. This repository declares every control as argv for `node` (D142), so nothing here exercises it. Session 33's `bootstrap` should say so where it writes a first `dabbler.yaml`. |
| **Round 1 nit — an argv suite is unrecordable** | `checks.load_checks` accepts a suite declaring `argv` and no `command`; `test_evidence.load_suites_checked` refuses it. Such a suite would run and be unrecordable, so it could never close. Latent — `argv` is used for controls, which that reader never sees — and **it may be the permissiveness rather than the refusal that is wrong**: a suite's command lands in the record as evidence, a control's does not. A session, not a patch, and adjacent to D116. |
| **Round 3 nits, both non-blocking and both carried** | (1) The Windows batch path still goes through `cmd.exe`, so `%VAR%` expansion remains — as it does on the Python side, for the same reason: a batch file is a cmd script. (2) `classifyPreverifyCommand` accepts a command that names every selected test *and* a broader directory. Both are Python's behaviour; changing either is a cross-router decision. |
| ~~**D176 — amends D169**~~ **DISCHARGED in session 33 (D213, D214)** | The three shapes it named unbuilt -- `disputed`, `at-cap`, `moved-machine` -- are built, and its premise is now inverted by caching: a shape is built ONCE and copied per case, so 42 cases over 5 shapes cost 161 s where 28 over 2 cost 193 s. The cost to watch has moved to the deterministic pass, which runs this control before every round. *Original text:* The parity cost to watch is a new SHAPE, not a new case: twelve cases run in less time than nine did. Three shapes are still unbuilt (`disputed`, `at-cap`, `moved-machine`) and each needs the offline transport plus canned verifier text. |
| **D164 — CLOSED in session 31 (D202)** | `identity.resolveSessionOrchestratorIdentity` is ported, as a wrapper over `resolveOrchestratorIdentity`, reading the record through `progress` rather than opening `sessions.json` a second time. Five tests cover the three selection branches and the two refusals, where the Python suite had none. *Nothing further owed.* |
| ~~**D168 — shared design**~~ **DISCHARGED in session 33 (D215)**, as a differential test rather than a parity case: `VERIFIED_NOT_REALLY` classifies as VERIFIED on both sides, and the test records the AGREEMENT so that the day either side tightens the token the other is told. *Original text:* | `parseVerificationResponse` tests the head with `startsWith("VERIFIED")`, so a look-alike (`VERIFIED_NOT_REALLY`) classifies as VERIFIED. **Faithful to Python, and deliberately not fixed in the port** — an improvement on one side only is exactly the drift parity exists to catch. Blast radius is small (the token chooses a parse branch, not an outcome: `classifyBlocking` is severity-derived, and `validateSessionVerdict` refuses the token exactly). If a boundary is wanted it goes into Python first and crosses with a parity case that feeds a look-alike to both — session 32. |
| ~~**D169 — cost to watch**~~ **RE-MEASURED AGAIN in session 33: 161 s for 42 cases across 5 shapes.** Caching a built shape was the lever it named and it more than paid for the three new shapes. | **193 s** for 28 cases across 2 shapes, against ~150 s for 12 cases — so more than doubling the case table cost ~28%, which confirms D176: the cost is a SHAPE, not a case, because a shape is what gets built twice per case that names it. The three unbuilt shapes (`disputed`, `at-cap`, `moved-machine`) all land with `verify` in session 33, and each will multiply against every case that uses it. **Caching a built shape across the cases that share it is the lever**, and session 33 is where it stops being optional. |
| ~~**D198 — the approved-plan reader**~~ **CLOSED in session 32 (D207).** | `progress.buildTaskRows` needs `approved_plan`'s `read_plan` and `effective_plan`, which land in session 32. Until a reader is registered through `useApprovedPlanReader`, a session with an `approved-plan.json` on disk gets `tasksRefused` where the task rows should be — deliberately, because rendering an empty list would say "this session has no tasks" over a session that has seven, and no corpus shape carries a plan for the control to catch it. Session 32 registers the real reader **and** should add a `progress --json` case on a shape that has a plan, which is the only thing that proves the two routers fold the steps the same way. |
| **D200 — two YAML emitter differences, moot at the CUTOVER** | `docs/modules.yaml` is compared and the common path is byte-identical, with four options reaching the `yaml` package to PyYAML (`indentSeq: false`, `singleQuote`, `lineWidth: 81`, `version: "1.1"`). Two inputs still differ: a scalar of exactly `y` or `n` (quoted here, plain in PyYAML) and a value carrying a newline (a `|-` block here, single-quoted and folded there). Both parse back to the same value and neither occurs in a kebab-case slug or an ordinary display name. Closing them means a PyYAML-compatible emitter for this document shape — a session, not a port's side effect — and it stops mattering the moment there is one emitter. |
| **D201 — `session migrate` has no parity case** | A corpus gap, not a divergence: every built shape is post-collapse, so there is no `docs/session-sets/<NNN-slug>/session-state.json` for the migration to read. Its refusals, its dry run and the cancelled-set fold are covered by both suites. A shape whose only purpose is a verb that runs once per repository, ever, is not worth ~12 s on every parity run — but if one is ever built for another reason, this case rides along free. |
| **D122 gap** | No path by which a verifier reviews a remediated-at-the-cap fix. Sessions 12 and 17 ended that way, so their last fixes are unreviewed today. |
| **D116** | A targeted-run form for filter-style runners (Maven `-Dtest=`, `dotnet test --filter`) plus the audit rule that checks one. "A session, not a patch." The port's vitest path-list form does not need it. |
| **D124** | Record the round cap on the round row as `verify.py` writes it; the unresolved-session view reads the live cap for a historical session. |
| **D126 nit 1** | `append_round` must refuse when the tree resolves and the anchor fails (`ledger.py`). Carried across the port unchanged (session 26). |
| **D114 nit 2** | `build_task_rows` renders a leaf, not a refusal, when `approved-plan.json` is missing while `step-execution.jsonl` carries an open step. |
| **D130 (was D88)** | Not owed — decided. The operator's override window on retiring the run core is open until session 34 starts. |
| **D134** | Round-1 change sets measure HEAD's raw tree against a snapshot that drops `.dabbler/`, so a repository that tracks its ledger reports it as deleted. Moot here since D135 and **confirmed moot** — session 23's first selection reported zero `selection_unknown` rows against 208 in each of 19–22 (D144). Latent elsewhere. If fixed on the Python side, do it before session 27 ports `affected`. |
| **D147 — RULED (D159), DONE in 25** | Session 23's step 5 is reworded: the control is declared and required from session 23, running the comparison that needs one router; the cross-router comparison joins it with the first ported verb. That verb turned out to be `metrics`, in session **25** rather than 26 — earlier than the ruling assumed, and costing nothing, because what the ruling protected was that no session be handed an instruction it cannot follow. Closed. |
| **D149 — CLOSED (D170), session 26** | Deleting a tracked file moved the whole-tree digest across the commit, because `git ls-files` still lists a tracked-but-deleted path and `surface_digest` wrote it a literal `"deleted"` hash. It cost session 23 a re-run and session 24 a forced close. **Fixed at the git seam as D160 ruled**: an unreadable path is omitted rather than marked, so a deletion moves the digest once and the commit that records it moves nothing. The marker string no longer appears anywhere in the router. Landed in its own commit before session 26's port, so the parity control compared two routers with the same intended behaviour, and it rode in the working tree so the verifier saw a change to a gate. |
| **D158 — framework** | `session close --force` promotes EVERY open session to complete, and its help says only "bypass bookkeeping gates". It cost session 24 a damaged ledger and a restore. Three fixes owed: say what the flag does; refuse (or require a second flag) when it would promote sessions that are not in flight; and stamp `forceClosed` on the session's row rather than the repository, so the ledger can say which session forced a close. Until they land, the trap lives in `AGENTS.md`'s preamble. |
| ~~**D152 — RULED (D162)**~~ **FULLY DISCHARGED**: the `modules` half in session 31 (D199), the `VerifyVerbs` half in session 33 (D216) -- `findingIndex` becomes `finding` because the flag is `--finding`, and `VerifyAdjudicateOptions` gains the `maxRounds` it always took. `WorkflowVerbs` remains owed to session 35. *Original text:* | `ModuleVerbs.list` and `.retire` -- and `ModuleRetireOptions` -- are trimmed from the contract: `ai_router.modules` has exactly `create`, and the manifest is create-only by design. Two of the extension's `refuse()` stubs went with them. **Still owed for the other half**: `VerifyVerbs`' option names (`verify dispute` takes `--finding`, not `--finding-index`) belong to session 33, and `WorkflowVerbs`' to session 35. |
| **D155 / D116** | The extension's mocha suite is still not a declared suite, so `affected` selects nothing for `tools/dabbler-ai-orchestration/` and session 24's largest change set had no recordable pre-verification evidence. Measured why it is not a one-line declaration: `targeted_command` appends the selected paths, and mocha MERGES a path list with its `spec` (both from the flag and from `.mocharc.json`) rather than being narrowed by it, so the bare command cannot mean "everything" while the appended form means "these". `runs_whole` would be false. It needs a runner entry point — D116's shape. |
| **Session 24 estimate** | "Net negative TS lines" was not met (+178 in the extension). `implements Router` requires all 32 methods and twenty of them refuse, which still costs their signatures. Not a defect; a fact about the contract's width, worth knowing when sizing sessions 30–34. |
| **D145/D146 — RULED (D161), DONE in 25** | Implemented as **D167**: `facts.run_control` keeps a passing control's own output in the record (capped at the same 1,500 characters a failure is), and a control that prints nothing on success records that it printed nothing — so "had nothing to say" and "said something the record dropped" are no longer the same row. Each parity case declares a `proves` string beside it, so a case added without saying what it proves does not typecheck. Closed. |
| **D119** | The solution level (one repository per library or service, plus an integrator) is not formalized. |
| Suite cost, the remainder | What is left is the loop's own git traffic (134 spawns in the slowest test). A fake git is still refused. The port's `journal.run_git` twin is where fewer round-trips per round would live. |

## Carried from the archived handoff, status not re-verified

Three items from the pre-148 *Next* list were not touched and were not
checked when this file was rewritten. Confirm or drop them:

- a round cap on `workflow review` (an unattended run keeps calling vendors);
- the Solution Explorer has not been screenshotted from a real VS Code;
- the CSV walkthrough is the wrong shape for a supervisor audience.

`.dabbler/runs/` is **not** tracked (D135, 2026-08-28), which is the
framework's own default; the archived "`.dabbler/` is git-ignored" item is
resolved by being true again.

## Next

**The port plan is finished. There is no session 37; the next plan is the
operator's to cut.** What follows is what session 36 leaves owed.

1. **The release is one tag push away, and it is the operator's** (D237).
   Both artifacts sit at 2.0.0, both pipelines point at the right registries
   (`release.yml` → npm, `publish-vscode.yml` → the Marketplace), and both
   are gated on a green `Test` run for the tagged commit. Pushing `v2.0.0`
   publishes the router; pushing `vsix-v2.0.0` publishes the extension. Both
   are irreversible — npm will not let a version's files be replaced — and
   the credentials live in GitHub deployment environments rather than on any
   development machine, which is why no session takes this step.

   **Publish the router first.** The extension declares
   `"dabbler-ai-router": "^2.0.0"` and bundles it, so the VSIX does not need
   the registry — but a consumer who reads the manifest and tries to install
   the dependency does.

2. **The Playwright layer is ported and has not been run.** It built its
   fixtures with Python snippets and pinned an interpreter setting that no
   longer exists; it now spawns the extension's own `dist/dabbler.cjs` and
   runs the router's source under Node's type stripping for the two writes
   that must go through a sanctioned writer. It is not a declared suite and
   CI does not run it, so nothing in this session's record says it works.
   **One Layer-3 run on a machine with the VSIX installed is what would
   close this**, and it is worth doing before 2.0.0 is announced rather than
   after: Layer 3 is the only layer that has ever caught a webview layout
   regression.

3. **A first-run walk on a machine that has never had this framework.**
   Session 34 proved the zero-install claim with a scratch repository and a
   terminal; session 36 changed what "installed" means — the extension now
   carries the router, its schemas and its command in `dist/`. The claim is
   checked here as far as it can be (`node
   tools/dabbler-ai-orchestration/dist/dabbler.cjs status` reads this
   repository's ledger and finds its own bundled schemas), but the thing to
   walk is a real VSIX install on a machine with no Node project, no
   `node_modules` and no `.venv`.

4. **The `dabblerSessionSets.pythonPath` setting is gone from the manifest,
   and an operator who set it has a dead value in their settings.json.** VS
   Code does not warn about a setting no extension declares. Nothing breaks;
   it is worth a line in the release notes rather than code.

5. **The evidence protocol's two gaps still have no caller.**
   `validate_transcript`, `validate_finding_evidence`, `authoritative_tier`,
   `verify_worker_result` and `record_worker_result` are ported and nothing
   calls them. `outputHash` is not re-derived from `rawOutput`, and a
   check's `evidence.pass.requires` contract is not enforced when its result
   is recorded. This passes to whichever session first turns
   `critique.pipeline` to `shadow`.

6. **The silently-replaced record is now cheap to fix, and it is still
   owed.** A malformed or hand-edited `sessions.json` or `activity-log.json`
   is *replaced* rather than refused: `readRawSessionState` answers `null`
   for unparseable JSON and the activity log is rebuilt from any read
   failure. A verifier called it a Major in session 26 and it is a fair call.
   **It is a redesign and it needs an operator ruling** — refuse and fail
   closed, or keep replacing and say so. It has been deferred through ten
   sessions on the grounds that two implementations would both have to
   change. There is one.

7. **`docs/ts-port-parity-control.md` and the run core's two design
   documents are superseded, not deleted.** Each carries a banner saying so.
   They stay because a decision whose reasoning has been deleted cannot be
   re-examined: D231 rests on the parity control's specification, and D130
   on the run-core blueprint.

8. **`BATON.md` at the repository root is stale** — a 2026-08-25 handoff
   that tells its reader work happens on `design/solution-decomposition`.
   `AGENTS.md` says `master` and is what an orchestrator reads first, so
   this is a trip hazard rather than a live contradiction. It was left alone
   deliberately: session 35's lesson is that an out-of-scope tidy-up is how
   a fix becomes a defect, and the cutover is not the session to test it.

9. **Two lessons from this session that generalise past the port.**
   - **A diff of a deletion is cost without information.** Removing the
     reference implementation made the evidence bundle 2.3 MB — four times
     the cap — and 95% of it was removed Python nobody would read.
     `--irreversible-delete` made it 257 KB with every deleted path still
     named. Any session that retires a module was paying this.
   - **An artifact that bundles a package has to let that package find
     itself.** `paths.ts` walks up for a `package.json` naming the router,
     which is correct in a checkout and in `node_modules` and answers
     nothing inside a VSIX. The fix was to make the bundle say what it is,
     not to teach the finder a fourth case.

---

**Session 35's superseded handoff**, kept because D224 is a correction to
it and the correction is only legible beside what it corrects:

### The brief, as session 35 received it

1. **Session 35 of 36 — the six-step workflow ported, the run core retired.**
   `workflow` (1,363), `solution` (351), `contractdoc` (196) and
   `stepreview` (284) — 2,194 lines, 99 tests — are ported, and `runcli`,
   `runcore`, `runproject`, `facts`, `fixloop`, `testphase` — 4,396 lines,
   119 tests — are deleted with their tests, closing D88. **`facts` is on
   that deletion list and it is now a live dependency**: session 33 ported
   it because `verify` cannot open a round without it, so read D210 before
   deleting anything named there. The list was written when `facts` was
   believed unported.

   **Run the import audit first.** D210's fifth sizing-error shape is that a
   module's session assignment and the session plan's prose are two records
   and nothing checks they agree. Session 34 ran the audit before touching
   anything — 21 symbols across seven modules, all present — and it cost
   minutes. Session 35's four modules are the last chance for this to bite.

   **The audit is necessary and not sufficient, and session 34 is the
   proof.** It confirmed every import resolved and still missed that a
   Python test in a *third* file (`tests/test_step_execution.py`) asserted
   the pre-commit hook's text. The selector found it, not the audit. Grep
   the tests of every module you change, not only its imports.

2. **A parity case can be green on a file that does not run, and only
   execution finds it.** Session 34's zero-install proof caught a commit
   guard that could never resolve on Windows while the control compared it
   byte for byte and was right to pass. **Where a session ships something
   that is executed rather than read, execute it** — the control compares
   writers, and two writers agreeing says nothing about whether the artifact
   they agree on works.

3. **The parity control's cost is still the deterministic pass, and session
   34 spent none of it.** `facts` runs the control before every round at
   roughly 161 s a time. Session 34 added two cases and **no sixth shape**,
   deliberately: the case it could not reach from a shape is driven against
   the reference in `differential.test.ts` instead. That is the pattern to
   copy — a differential test costs one session, a shape costs every round
   of every session that follows.

4. **D130 override window — the operator can still override retiring the run
   core, until session 35 starts.** It is now next, so this window closes
   with the start of the session after this handoff.

5. **The Python-naming sweep is bigger than the two seat items, and there is
   now a transcript.** `REFRESH_COMMAND` and the 24,000 handoff threshold
   (D196) are still addressed to the cutover. Session 34's proof adds two
   more the handoff did not name: `session start`'s next-step hint and the
   selector's recipe both print `python -m ai_router.<module>` to an
   operator who may have no Python (D221). **Session 36's step 5 should grep
   for `python -m ai_router` across strings the router PRINTS**, not only
   across the docs it names. Everything in this class is correct today
   *because* there are two routers.

   **This repository's own `AGENTS.md`, `CLAUDE.md` and `GEMINI.md` are on
   that list too.** Session 34 changed the generator, not the generated
   files: the fence here still names `.venv/Scripts/python -m
   ai_router.<module>`, which is what a session in this repository actually
   runs. Re-running `bootstrap` here is what refreshes them, and session 36
   is the commit that makes the new text true.

6. **One small fidelity gap is owed to the cutover** (D223).
   `packaging.ts`'s `recordedAt` writes millisecond precision where Python
   writes microseconds, and writes `.000` where Python omits the fraction
   entirely. Nothing compares it — normalization 1 collapses every timestamp
   and the schema wants only a non-empty string — so it is invisible until
   session 36, which is the commit where the record's timestamp format
   actually changes for anybody. `journal.ts:249` already implements
   Python's rule exactly, including the omit-when-zero case.

7. **The evidence protocol's two gaps still have no caller.**
   `validate_transcript`, `validate_finding_evidence`, `authoritative_tier`,
   `verify_worker_result` and `record_worker_result` are ported and nothing
   in either router calls them. `outputHash` is not re-derived from
   `rawOutput`, and a check's `evidence.pass.requires` contract is not
   enforced when its result is recorded. This passes to whichever session
   first turns `critique.pipeline` to `shadow`.

8. **Cite file and line in a dispute, and it will hold.** The verifier has
   run with `agency: none` for six sessions and cannot open the repository,
   so an assertion about what the code says is worth nothing without a
   citation — and worth a great deal with one. Session 34's round-1 Major
   was withdrawn in full against three citations, and the round that did it
   cost **12% of round 1's input**, the cheapest second round the port has
   bought, because the fix delta was empty. **A dispute with no remediation
   is both the cheapest second round and the one most likely to be right:**
   nothing moved between the rounds, so it is a clean re-judgement rather
   than a review of new work.

9. **A Python design question is now FOUR sessions past the comfortable
   moment to ask it.** A malformed or hand-edited `sessions.json` or
   `activity-log.json` is *silently replaced* rather than refused, in both
   routers: `readRawSessionState` answers `null` for unparseable JSON and
   the activity log is rebuilt from any read failure. A verifier called that
   a Major in session 26 and it is a fair call. **It is a redesign and it
   needs an operator ruling**: refuse and fail closed, or keep replacing and
   say so. The projection is the one place that already distinguishes them —
   an absent ledger reads the plan, an unreadable one reports
   `invariantViolation` — so the shape of the honest answer exists at the
   read boundary. The cheapest moment to apply it everywhere is **after
   session 35**, when there is one implementation again.

10. **Read `docs/ts-port-parity-control.md` before planning any session from
    here.** Session 34 added two amendments and did not add a fifth
    normalization: what the `bootstrap` row reaches and what it deliberately
    does not, and why `PYTHONIOENCODING` is an input rather than a rule. It
    also recorded a **second exception** to "a behaviour change is not a
    fix", with a two-part test that should be applied strictly — the plan
    named the change, **and** the compared artifact has no byte-identical
    form without it. Both held for the fence and the hook. Neither holds for
    a convenience.
