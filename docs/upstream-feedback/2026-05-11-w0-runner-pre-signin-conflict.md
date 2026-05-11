# W0 runner auto-injects `SeededSignInAsync`, breaking DSL-driven `/login` checklists

> **Target repo:** `darndestdabbler/dabbler-uat-dsl`
> **Suggested issue title:** "Runner-emitted Playwright wrapper auto-signs-in via SeededSignInAsync, breaking checklists whose `Steps[]` start with `NAVIGATE TO \"/login\"`"
> **Reporter:** `dabbler-ai-orchestration`, Set 019 Session 2 (2026-05-11), summarizing surfacing context from `dabbler-platform/docs/session-sets/admin-users-cross-links/upstream-feedback-disposition-gate.md`
> **Surfacing context:** `dabbler-platform`'s `admin-users-cross-links` Session 1 W2 attempt (2026-05-11)

This is a hand-off artifact, not a permanent doc. Copy the body
into a fresh GitHub issue against `dabbler-uat-dsl` next time you
touch that repo, then this file can be archived.

---

## What happens

The W0 runner emits a thin xUnit wrapper around the compiled DSL:

```csharp
[Fact]
public async Task RunChecklistAsync()
{
    var page = await _fixture.CreatePageAsync();
    await _fixture.SeededSignInAsync(page, "admin@acmecoffee.com");  // ← auto-inserted
    var adapter = new PlaywrightFixtureUatAdapter(_fixture);
    await <Name>Uat.RunAsync(adapter, page);
}
```

`SeededSignInAsync` is correct for checklists like
`w0-cli-suppressions-and-role-pinning` (whose first DSL step is
`NAVIGATE TO "/admin/products"` — post-login). But for checklists
authored under the `dabbler-platform/docs/planning/project-guidance.md`
"self-contained user journey starting from `/login`" Convention,
the auto-inserted pre-sign-in collides:

1. Wrapper signs in via `SeededSignInAsync` → the persona's session cookie is set.
2. DSL runs `NAVIGATE TO "http://localhost:5010/login"` → server redirects to `/dashboard` (already signed in).
3. DSL runs `CLICK INPUT with label "Email address" and enter "admin@acmecoffee.com"` → fails with `TimeoutException : Locator … GetByLabel("Email address")` because `/dashboard` does not render an email input.

## Why a consumer can't easily work around this on their end

- Manually editing the wrapper is non-durable — the runner overwrites it on every compile.
- Removing the wrapper from the runner's emission isn't a consumer-side choice; it lives in this repo's `uat_runner`.
- Working around with suppressions only quiets the validator — the Playwright runtime still hits the timeout.
- The `masking-audit-uat-remediation` set side-stepped this by hand-authoring its Playwright test (no W0 emission). New sets following the project-guidance Convention can't take that path because it deprecates the W0 pipeline.

## Concrete suggestions (ordered by leverage)

### 1. Auto-detect DSL-driven login (recommended)

Inspect the compiled DSL output (or the checklist JSON pre-compile).
If the first navigation step is to `/login` (or matches
`personas.json[persona].login_route` if that becomes a thing), skip
the `SeededSignInAsync` line in the emitted wrapper. The runner
already inspects the checklist's first sign-in step to infer
`--active-role` per `personas.json` — extending that inspection to
"first step is `/login` → suppress pre-sign-in" is the cheapest fix
and requires no consumer-side opt-in.

### 2. Explicit CLI flag: `--no-pre-sign-in`

Add a flag to `python -m uat_runner.cli` (or equivalent emission CLI)
that, when passed, omits `SeededSignInAsync` from the emitted
wrapper. Consumer-side sets that author DSL-driven login pass the
flag. Less elegant than auto-detect but easier to land and easier
to document.

### 3. Make pre-sign-in opt-in via checklist top-level field

Add a top-level field `PreSignIn: false` (default `true` for
back-compat) on the checklist JSON. Sets that author DSL-driven
login set this to `false`. The runner reads the field and decides
whether to emit `SeededSignInAsync`.

## What the consumer side did in the meantime

`dabbler-platform/admin-users-cross-links` Session 1: shipped the
human-readable UAT checklist following the project-guidance
"self-contained user journey" Convention, accepted W2-compiled-test
failure as a documented blocker in `disposition.json`, relied on
bUnit tests for programmatic correctness of dropdown filtering +
banner visibility + cross-link rendering. Once the W0 runner
enhancement lands, re-run W2 to convert the blocker to a closed
item.

## Cross-reference

Related to the `disposition.json` discoverability fix delivered in
`dabbler-ai-orchestration` Set 019 Session 1 (commit `94260a6`). Both
flow from the same root cause — runner-emitted scaffolding and
gate machinery introducing constraints that consumer-side
workflow docs haven't been updated to reflect. The disposition-gate
piece landed upstream as documentation + error-message link
improvements; this W0-runner piece needs a code-level change here in
`dabbler-uat-dsl`.

## Acceptance for the fix

Whichever suggestion lands, the smoke test on the consumer side is:

1. `dabbler-platform/admin-users-cross-links` Session 1's W2 checklist re-runs without modification.
2. The compiled Playwright test starts at `/login`, clicks the email input, signs in via the DSL flow, and reaches the post-login destination.
3. No timeout on `GetByLabel("Email address")`.
4. The pre-existing `w0-cli-suppressions-and-role-pinning` test (post-login first step) still passes — i.e., the change is backwards-compatible for checklists that legitimately want pre-sign-in.
