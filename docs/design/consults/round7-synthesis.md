# Design consult, round 7 — synthesis and decision: the wall is what is on the disk, and the contract is what gets read

**Decided 2026-09-06 by the orchestrator under the standing unattended-work
directive**, after `round7-brief.md` was answered by Sol (`gpt-5.6-sol`,
`round7-sol.md`) and Gemini (`gemini-3.1-pro-preview`, `round7-gemini.md`).
This amends `round6-synthesis.md`: the repository shape stands; the order
and the nature of the wall change. The operator can overrule any of it.

## The reframed objective, and what it is measured by

The operator: *"we want to prevent AI from reading more code than it needs
to read … what if the code is in a child directory in the repo."* Packages
serve the compiler; they do nothing to a reader with the sibling's source on
the same disk. Both advisors accept the reframing and both say the same
thing about the metric: **counting reads is the wrong measure**. One `Read`
returns a line; one shell command returns a tree; in the orchestrator's own
session the ratio was 137 Bash to 6 Read, and a `node -e` that opens a file
shows no path at all. What can be measured honestly, on every engine, is
**exposure**: the bytes of sibling *implementation* source present in the
filesystem the engine runs in. The target is zero. Generated contracts,
documentation and packages do not count as exposure.

Two honest limits, both Sol's. "Prevent" means ordinary and accidental
reads: a sparse checkout removes directories, it does not stop a
deliberate `git fetch` of excluded blobs, a decompile of a package, or a
read of another checkout by absolute path, and the framework must not
claim otherwise. And the wall reaches only the sibling-source share of the
$6,000; nothing in the record separates that from the engine re-reading
the module it was changing, which a wall cannot touch.

## The layers, ranked (both advisors, independently, in this order)

1. **Nothing to read in the session's filesystem.** The only wall that
   holds for all four engines, because `cat`, `grep`, `Read` and a script
   all fail the same way on a file that is not there. Sol adds the
   condition that makes it real: the session's checkout must be a
   **dedicated blob-filtered sparse clone**, not a worktree beside the
   developer's full checkout, because worktrees share one object store and
   `git show HEAD:modules/bar/…` would answer from it.
2. **Something better to read instead.** A generated, committed public
   surface per module. It removes the *need* to go looking, and it is what
   a human does too (go to definition on a reference assembly).
3. **The verifier refuses out-of-scope reads** instead of counting them.
   It governs the framework's own token spend, not the engine's, and is
   cheap: `inScope` already exists in `agency.ts`.
4. **Engine-side rules and transcript audits: defence in depth and
   diagnostics only.** Claude Code's `Read(pattern)` denies cover `cat`,
   `head`, `tail`, `sed` and redirections but not subprocesses;
   `permissions.blockReadsOutsideWorkingDirectories` is a real
   working-directory wall for that one engine; Copilot's read deny is
   all-or-nothing; Codex and Gemini document none. Transcripts are
   internal-format and shell-opaque. Gemini calls the audit theatre; Sol
   calls it an optional adapter to build last. Neither would gate on it.

Theatre, named by both: a `.slnf` presented as a read boundary; an
after-the-fact budget presented as prevention; verifier refusal presented
as control over the engine; path rules presented as cross-engine. The
genuine fifth layer is a container or a separate OS user with only the
focused checkout readable, and both advisors put it where rules (b) and
(d) put it: a hardened mode for teams already on dev containers, never the
default.

## The design, as five slides (replacing round 6's)

1. **One trunk monorepo, a solution plan first.** Unchanged from round 6:
   `modules/<slug>/`, `docs/planning/solution-plan.md` and
   `docs/modules.yaml` as a reviewed hypothesis, the six-step workflow
   deleted.
2. **A session runs in a focused checkout.** `dabbler module open <slug>`
   makes a blob-filtered sparse clone holding the module's source and
   tests, the shared root build files, and every dependency's *contract*
   and *package* — no sibling implementation exists in it. The engine's
   working directory is that checkout; under Claude Code the framework
   also sets the working-directory read block in the settings file it
   already writes. The land merges back to trunk. Humans keep a full
   checkout for integration work and never have to type a git command for
   any of this.
3. **The contract is what the AI reads.** `modules/<slug>/contract/` holds
   a generated public surface — GenAPI-style C# stubs for .NET,
   `javap -public` plus Javadoc for Java — with the XML or Javadoc
   comments, plus a short human-authored page of behavioural rules and
   one or two consumer examples. It is regenerated at every land beside
   the package, committed so it is diffable in the pull request and
   present in a clean focused checkout, and the land refuses when the
   contract, the package and the declared version disagree. The existing
   `contractdoc` verb is repointed to produce it. A sibling's tests are
   not exposed by default.
4. **Packages are committed, small, immutable.** The follow-up decision
   stands: one hierarchical feed folder in the tree, sortable dev
   versions, a size ceiling with LFS above it, and a restore that fails
   rather than rebuilding an absent sibling from source. No source or
   symbol packages in the focused feed.
5. **One module per session, the exception declared.** The plan names
   one module; `modules: [a, b]` with a reason such as `contract-change`
   opens a checkout with both sources and is reported as such. The
   verifier refuses reads outside the declared modules. The framework
   records an **exposure manifest** at start and close: declared modules,
   sibling implementation bytes present (zero), contracts and packages
   present, files changed outside the plan. Bundling stays recorded, never
   executed.

## Where the advisors differ, and the call

- **Worktree vs. clone.** Gemini says sparse worktree; Sol says a
  dedicated blob-filtered clone, because a worktree shares the full
  checkout's objects. **Sol's condition is adopted.** It costs the
  framework one more clone per session and nothing the developer sees.
- **Approval for the exception.** Sol wants reviewer approval before a
  two-module session starts; Gemini wants a budget multiplier. **A
  declared reason, reported in the Work Explorer, and no approval gate**
  for now: a team of one has no reviewer, and the owed-decision machinery
  can add one later if the exception starts to become the default.
- **The audit.** Gemini: do not build it. Sol: optional adapter, last.
  **Not built in this block.** The exposure manifest is the measure; a
  transcript adapter is a later diagnostic if anyone asks for one.
- **N repositories.** Both keep the monorepo default for 3–10 modules and
  keep the multi-repository mechanisms as the secondary mode for modules
  with genuinely independent owners or release cadences. Sol's point
  stands in the record: N clones opened together by `dabbler workspace`
  are not a wall either; the wall is always the one checkout the session
  runs in.

## Which rules decided it

(a) a focused checkout is what a careful developer does by hand when they
want an assistant to stay put — open only that project — done for them;
committed API surfaces are how .NET already ships reference assemblies.
(b) five slides; the developer's only new word is "the module opens in its
own folder". (c) the disk is simpler and more reliable than any rule
engine, and works on every engine. (d) the framework spends clones and
generated files to keep the engine's context small; the developer's time
is untouched. (e) .NET first, with the Java equivalent named at each step.
(f) two advisors, converged.

## The sessions (amending round 6's eight; real dependencies marked →)

1. **Solution plan and module manifest.** Unchanged.
2. **Module-aware configuration, and the exception schema.** → 1.
   `modules:` in the root `dabbler.yaml`; a session declares one module
   by default, `modules: [a, b]` with a reason otherwise.
3. **The contract surface.** → 2. `contractdoc` repointed: a deterministic
   bundle from the built assembly, its XML docs and a human-authored
   notes page, committed under `modules/<slug>/contract/`; .NET first.
4. **Committed immutable packages and a clean restore.** → 2. The
   hierarchical feed folder, sortable dev versions, the size ceiling and
   LFS above it, restore that refuses to rebuild a sibling.
5. **The focused checkout.** → 3, 4. `dabbler module open <slug>`: a
   blob-filtered sparse clone with the module, root build files,
   contracts and packages; the `.slnf`; the engine's working directory;
   the Claude Code working-directory block; the land back to trunk.
6. **Module-scoped sessions and the hard verifier scope.** → 2, 5.
   `sessionScope`/`inScope` become module-based and refusing; the
   exposure manifest at start and close; the Work Explorer groups by
   module.
7. **The land: contract and package regenerated together, drift, the
   ceiling, bundles.** → 3, 4, 6. One atomic land; contract/package/
   version agreement gate; `stale-local` drift; LFS policy;
   `release/<bundle>/bundle.yaml` recorded.
8. **Maven parity and the secondary mode.** → 3–7. `javap -public` plus
   Javadoc contracts, a solution-local repository, `-pl` without `-am`;
   regression for `solution-dependencies.json`, `repositories` and
   `deps clone/scaffold`; the csv-pipeline tutorial re-cut.

Session 100 is item 1, as before. Nothing in sessions 1–4 depends on the
wall; the wall (5) is usable only once contracts and packages exist to
stand in for the source it removes.
