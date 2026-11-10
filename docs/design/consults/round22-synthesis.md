# Consult round 22 — synthesis

2026-11-10. One brief, `round22-brief.md`: maintaining EXISTING .NET and
Java repositories (ASP.NET MVC on .NET Framework 4.5+, ASP.NET Core MVC,
plain Maven, Spring Framework WAR, Spring Boot) with developers moving
between VS Code and Visual Studio, IntelliJ or Eclipse. Answers:
`round22-sol.md` (`gpt-6.1-sol`, direct API) and `round22-gemini.md`
(`gemini-4-argon`, direct API). Claims were checked against the tree
before they were repeated.

## Where both agreed

Recognise a repository that holds code, confirm a maintenance posture with
the person, record it in `dabbler.yaml`, switch the root-file scaffold off
under it, hold the target with a deterministic check rather than a prompt
rule alone, build non-SDK .NET Framework through MSBuild and vstest found by
`vswhere`, and stop plainly on a machine without them rather than fall
back to `dotnet test`. Both named the same IDE files to leave alone:
`.vs/`, `*.user`, `.idea/`, `*.iml`, `.project`, `.classpath`, `.settings/`.

## Where they split, and the call

- **Baseline for the target check.** Sol: evaluated MSBuild properties and
  the effective POM. Argon: the declared elements diffed against HEAD.
  Argon's is taken: no toolchain, no stored baseline, no new state, and
  every edit an engine can make to a build file is in the diff.
- **Dabbler's files in a shared repository.** Argon would keep them local
  (`.git/info/exclude`) so a ten-line fix does not arrive with six
  framework files and two prose planning sessions. Sol would commit them
  after confirmation. Sol's is taken on the files, because a choice is the
  repository's and the record travels; Argon's point is taken on the
  ceremony, so the maintenance posture skips the tier and module-cut
  planning and plans one short section per change.
- **Argon's hook claim is wrong.** The pre-commit guard lives in the
  untracked `.git/hooks`, is never cloned, and never overwrites an existing
  hook (`bootstrap/index.ts`, `ensureCommitGuard`).
- **Argon's "silently green" on `*Tests.java` is overstated.** A change
  whose named test does not exist records `selection_unknown` and the whole
  suite still runs at close (`affected.ts`, `classifyPreverifyCommand`).
  The plural-glob miss itself is real.
- **Sol's push-back stands.** "Compiles and tests pass in every IDE after
  every session" is qualified to: the build contract is preserved,
  verified on a supported Windows host, and a session never closes without
  that evidence.

## Verified against the tree the same day

`bootstrap/detect.ts` reads the root only and never the project style;
`ecosystem.ts`'s `ensureRootFiles` writes `.slnx` and a
`Directory.Build.props` enabling Nullable and ImplicitUsings for more than
one project with no ROOT solution file, which MSBuild imports into non-SDK
projects; nothing reads `ToolsVersion`, `TargetFrameworkVersion` or
`global.json`; the Maven test glob is singular only.

## What followed

Sessions 305 to 309 in `docs/sessions/session-plan.md`, commit
`c9c363b9`: posture and detection, the `contract` control, the
`dotnet-framework` runner, the walk through six forked public
repositories outside this one, and release 3.31.0.
