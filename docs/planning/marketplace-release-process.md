# Release process — `dabbler-ai-orchestration` to the VS Code Marketplace

> **Purpose:** The single source of truth for shipping a new version of
> the **Dabbler AI Orchestration** VS Code extension to the Microsoft
> VS Code Marketplace (and the Open VSX Registry) via the
> tag-driven workflow at
> [`.github/workflows/publish-vscode.yml`](../../.github/workflows/publish-vscode.yml).
>
> **Audience:** The human who pushes the release tag. The workflow runs
> automatically; this doc covers the parts that aren't automated — the
> one-time Marketplace + Open VSX publisher configuration, the
> per-release checklist, and the rollback path when something goes
> wrong.

---

## Why a Personal Access Token (not OIDC)

PyPI's release workflow at [`.github/workflows/release.yml`](../../.github/workflows/release.yml)
uses GitHub-OIDC trusted publishing precisely because long-lived
secrets in `secrets` carry well-documented compromise paths. The VS Code
Marketplace **does not yet support OIDC trusted publishing** (last
surveyed 2026-05-04). The supported path for unattended publishes is an
Azure DevOps Personal Access Token (PAT), scoped to the Marketplace
publish capability and stored as `VSCE_PAT` in a GitHub deployment
environment.

Mitigations layered on top of the unavoidable PAT:

- **PAT scope:** mint the PAT with **only** the "Marketplace (publish)"
  scope. It cannot read other Marketplace data, cannot publish other
  publishers' extensions, cannot enumerate organizations.
- **Environment binding:** store `VSCE_PAT` at the environment level
  (`marketplace`), not the repo level. The build job above the publish
  step does not have access to it. Only jobs that opt into the
  `marketplace` environment can read it.
- **Required-reviewer gate:** configure a required reviewer on the
  `marketplace` environment so each publish run pauses for one-click
  human approval before it consumes the secret.
- **Rotation:** rotate the PAT annually at minimum. Azure DevOps PATs
  have a configurable expiry; choose a calendar-friendly value.

When Marketplace OIDC support lands upstream, file a follow-up issue
to migrate. Until then, the runbook below is the path.

The Open VSX Registry uses the same PAT model (`OVSX_PAT`); the same
mitigations apply.

---

## Naming

- **Marketplace publisher ID:** `DarndestDabbler` (matches the
  `publisher` field in
  [`tools/dabbler-ai-orchestration/package.json`](../../tools/dabbler-ai-orchestration/package.json)).
  Confirm available on the Marketplace before the first publish; if a
  collision is found, the practical fallbacks are `dabbler` or
  `darndest-dabbler`. Update `package.json`'s `publisher` field, the
  workflow's `environment.url`, and this doc together — the Marketplace
  fully-qualified ID (`<publisher>.<extension>`) flows from these.
- **Marketplace extension ID:** `dabbler-ai-orchestration` (matches the
  `name` field in `package.json`). The fully-qualified Marketplace ID
  is `DarndestDabbler.dabbler-ai-orchestration`.
- **Open VSX namespace:** matches the Marketplace publisher ID
  (`DarndestDabbler`). Open VSX recommends the same publisher ID across
  registries to avoid trust ambiguity for users.
- **First Marketplace release:** `vsix-v0.13.0`. The 0.x series
  signals "API may change between minor versions" while the extension
  finds its shape on the Marketplace. Promotion to 1.0 is a separate,
  deliberate decision.

---

## Tag-pattern coexistence with PyPI

This repo carries two tag-driven release pipelines:

- `.github/workflows/release.yml` — PyPI / TestPyPI for `dabbler-ai-router`.
  Triggers on `v*` **with `!vsix-v*` excluded** (`tags: ['v*',
  '!vsix-v*']`). Filters internally to `v[0-9]+.[0-9]+.[0-9]+` and
  `v[0-9]+.[0-9]+.[0-9]+-rcN`.
- `.github/workflows/publish-vscode.yml` — VS Code Marketplace + Open VSX.
  Triggers on `vsix-v*` tags. Filters internally to
  `vsix-v[0-9]+.[0-9]+.[0-9]+` and `vsix-v[0-9]+.[0-9]+.[0-9]+-rcN`.

The `vsix-` prefix on extension tags is deliberate and load-bearing: it
keeps the two pipelines from colliding when both are tag-driven on the
same default branch. **A plain `v0.13.0` tag publishes the Python
package to PyPI; a `vsix-v0.13.0` tag publishes the extension to the
Marketplace.**

The negative-pattern exclusion in `release.yml` is **load-bearing
mechanism**, not just bookkeeping. GitHub's tag-pattern matcher treats
`v*` as a glob that matches the literal `v` followed by anything —
`vsix-v0.13.0` matches `v*` because `vsix-v0.13.0` literally starts
with `v`. Without the `!vsix-v*` exclusion, every Marketplace tag push
would also trigger the PyPI workflow, which would then fail its strict
classify regex and post a noisy red-X to the GitHub Actions tab on
every Marketplace release. The `!pattern` form is required because
GitHub Actions does not allow combining `tags:` with `tags-ignore:` in
the same `on:` block.

Mixing the two tag families up has well-defined failure modes (the
`classify` job in each workflow rejects unrecognized patterns), but the
prefix + exclusion exists precisely to make the misroute hard to do
accidentally.

---

## One-time setup (do this before the first release)

### 1. Create the Microsoft / Azure DevOps account that owns the publisher

The Marketplace authenticates via Microsoft accounts that have an
attached Azure DevOps organization. If the operator does not already
have one:

- Sign in at [`marketplace.visualstudio.com/manage`](https://marketplace.visualstudio.com/manage)
  with the Microsoft account that should own the publisher. The
  Marketplace UI walks the operator through Azure DevOps organization
  creation if one isn't already attached.
- The publisher is owned by **the Microsoft account**, not the GitHub
  organization. Plan for ownership transfer in the rare case the human
  custodian changes (Marketplace supports it, but it's a manual ticket
  to Microsoft).

### 2. Claim the Marketplace publisher ID

- At [`marketplace.visualstudio.com/manage`](https://marketplace.visualstudio.com/manage)
  → **Create publisher**.
- Fill in:

  | Field | Value |
  |---|---|
  | Publisher ID | `DarndestDabbler` |
  | Publisher display name | `Darndest Dabbler` (or operator preference) |
  | Email contact | the operator's email |

- The publisher ID is **case-insensitive but case-preserving** — claim
  it with the casing you want shown in URLs and `package.json`.
- If `DarndestDabbler` is already claimed (it should not be, per check
  on 2026-05-04), the practical fallbacks are `dabbler` or
  `darndest-dabbler`. Update [`tools/dabbler-ai-orchestration/package.json`](../../tools/dabbler-ai-orchestration/package.json)'s
  `publisher` field, this doc's "Naming" section, and the workflow's
  `environment.url` to match the claimed ID.

### 3. Mint the Marketplace PAT (Azure DevOps)

- Sign in to [`dev.azure.com`](https://dev.azure.com) with the same
  Microsoft account that owns the publisher.
- Click the user avatar (top-right) → **Personal access tokens** → **+ New Token**.
- Fill in:

  | Field | Value |
  |---|---|
  | Name | `dabbler-ai-orchestration Marketplace publish` |
  | Organization | **All accessible organizations** (required — Marketplace lives outside any one Azure DevOps org) |
  | Expiration | **365 days** (or shorter; record the date for rotation) |
  | Scopes | **Custom defined** → expand → **Marketplace** → check **Manage** |

- Click **Create**. **Copy the token immediately** — the UI does not
  show it again.

### 4. Configure the GitHub deployment environments

On `github.com/darndestdabbler/dabbler-ai-orchestration` →
**Settings → Environments**, create two environments:

- **`marketplace`** — for Marketplace publishes.
  - Add the `VSCE_PAT` **environment secret**, paste the PAT minted in
    step 3.
  - **Required:** add a required reviewer (yourself) so each Marketplace
    release prompts a one-click approval before the publish job runs.
    Unlike PyPI's TestPyPI, the Marketplace has no first-class staging
    target, so the human-in-the-loop gate is the primary mitigation
    against an accidental publish.
  - Optional: restrict to deployment from `master` (or whatever the
    default branch is) so feature-branch tag pushes can't trigger.
- **`openvsx`** — for Open VSX publishes.
  - Add the `OVSX_PAT` **environment secret** if dual-publish is
    enabled (see step 5). If left empty, the workflow's Open VSX job
    logs a skip and exits cleanly.
  - Optional: required reviewer. Open VSX is the secondary registry;
    requiring approval here adds a second click but is not strictly
    necessary.

### 5. (Recommended) Configure Open VSX Registry dual-publish

Cursor, VSCodium, and various other VS Code forks read from
[Open VSX](https://open-vsx.org/) rather than the Microsoft Marketplace.
Dual-publishing widens reach with minimal additional work. Skip if the
operator wants to keep distribution Marketplace-only for now; the
workflow handles a missing `OVSX_PAT` cleanly.

To enable:

- Sign in at [`open-vsx.org`](https://open-vsx.org/) with the GitHub
  account that should own the namespace (Open VSX uses GitHub OAuth).
- **User Settings → Access Tokens → Generate New Token.** Copy it.
- Open VSX namespaces are claimed via a separate ticket-based flow if
  the desired namespace matches the operator's GitHub identity, the
  default flow auto-grants. See
  [`github.com/EclipseFdn/open-vsx.org/wiki/Namespace-Access`](https://github.com/EclipseFdn/open-vsx.org/wiki/Namespace-Access).
- Store the token as `OVSX_PAT` in the `openvsx` GitHub environment.

### 6. Verify by publishing a release candidate (optional)

The workflow's RC and final tag patterns (enforced by the `classify`
job) are:

- **RC tag:** `vsix-v[0-9]+.[0-9]+.[0-9]+-rcN` exactly. Examples:
  `vsix-v0.13.0-rc1`, `vsix-v0.13.0-rc2`. The dash before `rc` is part
  of the git tag spelling **and** the semver pre-release form
  (vsce / Marketplace use semver 2.0.0 natively, no normalization).
- **Final tag:** `vsix-v[0-9]+.[0-9]+.[0-9]+` exactly. Example:
  `vsix-v0.13.0`.

For an RC, set `package.json` to the matching pre-release semver
(`"version": "0.13.0-rc1"`), commit, then tag and push:

```bash
git tag vsix-v0.13.0-rc1
git push --tags
```

The workflow then:

1. Classifies the tag as RC (semver `0.13.0-rc1`).
2. Builds the VSIX and verifies the version matches `package.json`.
3. **Skips both publish jobs** because `is_final == 'false'`.
4. Leaves the VSIX as a downloadable workflow artifact (30-day
   retention) for the operator to inspect.

This exercises the classification, build, and version-check paths
without claiming a Marketplace version slot. The downloadable VSIX can
be installed locally via **Extensions → ... → Install from VSIX...**
for a final smoke test before the real publish.

> The RC dry run is *optional*. The first-ever Marketplace publish is
> the one that's most likely to surface workflow misconfigurations
> (PAT not in the right environment, publisher ID typo, etc.) — it's
> worth doing one RC first. Subsequent releases of well-understood
> changes can skip directly to the final tag.

---

## Per-release checklist

Run through this every time. The whole loop takes ~10 minutes if
nothing goes wrong, plus the time the operator spends watching the
publish run and the post-publish Marketplace listing.

1. **Decide the version.** Bump per semver:
   - `0.x.y` → `0.x.(y+1)` for fixes
   - `0.x.y` → `0.(x+1).0` for new features (this is the common case
     while the API is still settling — no API stability guarantees in
     the 0.x range)
   - `0.x.y` → `1.0.0` only when the maintainer explicitly commits to
     API stability. Don't slide into 1.0 by accident.

2. **Update [`tools/dabbler-ai-orchestration/package.json`](../../tools/dabbler-ai-orchestration/package.json).**
   Edit the `version` field. The release workflow's `build` job
   verifies the tag matches this string; a mismatch exits the run
   before any upload.

3. **Author release notes.** Update
   [`tools/dabbler-ai-orchestration/CHANGELOG.md`](../../tools/dabbler-ai-orchestration/CHANGELOG.md):
   move anything from `[Unreleased]` into the new `## [X.Y.Z] —
   YYYY-MM-DD` section, capture what changed, what adopters need to do,
   any breaking changes (rare in 0.x). The CHANGELOG is part of the
   VSIX bytes — Marketplace listings render the latest section as the
   "What's New" callout.

4. **Commit `package.json` + `CHANGELOG.md`.**

   ```bash
   git add tools/dabbler-ai-orchestration/package.json \
           tools/dabbler-ai-orchestration/CHANGELOG.md
   git commit -m "Bump extension to vsix-vX.Y.Z"
   git push origin master
   ```

5. **(Optional) RC dry run.** If the change touches the publish
   pipeline itself, the package layout, or `package.json`'s
   `contributes` block — anything that could break the publish path
   or change the install footprint — ship a `-rcN` tag first. Set
   `package.json` to the matching `X.Y.Z-rcN` semver, commit, then:

   ```bash
   git tag vsix-vX.Y.Z-rc1
   git push --tags
   ```

   Watch
   [`github.com/darndestdabbler/dabbler-ai-orchestration/actions`](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions)
   for green. Download the VSIX artifact, install it locally
   (**Extensions → ... → Install from VSIX...**), confirm the
   activity-bar icon and command-palette entries show up. Before the
   final tag, change `package.json` back to the dashless final form
   (`X.Y.Z`) — both the version field and the git tag have to agree,
   and the `build` job's verify step fails the workflow loudly when
   they don't.

6. **Tag and push the final release.**

   ```bash
   git tag vsix-vX.Y.Z
   git push --tags
   ```

7. **Approve the deployment.** GitHub will email / show a notification
   that the `marketplace` environment is awaiting review. Click
   through to the run, click **Review deployments**, check
   `marketplace`, click **Approve and deploy**. If Open VSX dual-publish
   is enabled and configured with a required reviewer, repeat for
   `openvsx`.

8. **Verify on the Marketplace.** ~30 seconds after approval, the
   extension is live at
   `https://marketplace.visualstudio.com/items?itemName=DarndestDabbler.dabbler-ai-orchestration`.
   Smoke test in a fresh VS Code instance (use a different machine, a
   profile, or a temp container if you want a really clean check):

   ```bash
   code --install-extension DarndestDabbler.dabbler-ai-orchestration
   ```

   Or in the VS Code UI: **Extensions → search `DarndestDabbler`**,
   click **Install**. Open a workspace with `docs/session-sets/` and
   confirm the activity-bar icon and command-palette entries surface.

9. **Verify on Open VSX** (if dual-publish enabled). The listing
   appears at
   `https://open-vsx.org/extension/DarndestDabbler/dabbler-ai-orchestration`.
   Cursor / VSCodium users install via their respective extension UIs.

10. **Create the GitHub release** (optional, for changelog visibility):

    ```bash
    gh release create vsix-vX.Y.Z --title "Extension vX.Y.Z" --notes-from-tag
    ```

    The Marketplace publish run already uploaded bytes; this step is
    purely for the GitHub-side release-list UX.

11. **Update consumer repos.** Bump any consumer repo that pins a
    specific VSIX version — `dabbler-access-harvester` and
    `dabbler-platform` are the current consumers (per `CLAUDE.md`).
    With the Marketplace path live, consumers should switch to
    Marketplace-installed instead of vendoring the VSIX.

---

## Rollback

The Marketplace allows **unpublishing a specific version** of an
extension. From the publisher's
[`marketplace.visualstudio.com/manage`](https://marketplace.visualstudio.com/manage)
page, click the extension, click the version's **...** menu →
**Unpublish**. Implications:

- Users on auto-update get bumped down to the previous published
  version on their next refresh.
- Users who explicitly pinned the unpublished version
  (`code --install-extension DarndestDabbler.dabbler-ai-orchestration@X.Y.Z`)
  get an install failure on retry.
- The unpublished version's bytes are removed from the Marketplace
  CDN; you cannot re-upload the same version. Cut a new
  `vsix-vX.Y.(Z+1)` with the fix.

For Open VSX, the equivalent is a manual takedown ticket to the
Eclipse Foundation. Open VSX publishes are append-only from the
operator's side.

The two practical rollback paths in priority order:

- **Patch forward.** Cut `vsix-vX.Y.(Z+1)` with the fix. Common case.
  Auto-update users converge on the fixed version within the
  Marketplace's CDN refresh window.
- **Unpublish + patch forward.** Use when the broken version is
  actively hurting people (e.g., it crashes on activation in a way
  that prevents users from disabling it). Unpublish first, then ship
  the patch.

---

## Failure modes and how to recognize them

| Symptom | Likely cause | Fix |
|---|---|---|
| Workflow fails at "Verify tag matches package.json version" | Pushed the tag before bumping `package.json`, or pushed an RC tag while `package.json` still has the final form (or vice versa) | Delete the tag locally + remote (`git tag -d vsix-vX.Y.Z; git push --delete origin vsix-vX.Y.Z`), bump or fix `package.json` to match the semver form of the tag, commit, retag. |
| Workflow fails at the `classify` job with "tag does not match the release pattern" | Tag spelling doesn't match `vsix-v[0-9]+.[0-9]+.[0-9]+` or `vsix-v[0-9]+.[0-9]+.[0-9]+-rcN` exactly (e.g., missing `vsix-` prefix, `vsix-v1.0.0rc1` without the dash, `vsix-v1.2`, `vsix-vfoo`) | Re-tag with the canonical spelling. The dash before `rc` is required; vsce uses semver natively. |
| `publish-marketplace` fails with "Personal Access Token verification failed" | PAT expired, was revoked, or has the wrong scope | Mint a new PAT (per "One-time setup → 3"), update `VSCE_PAT` in the `marketplace` environment, retry the workflow run via **Re-run failed jobs**. |
| `publish-marketplace` fails with "publisher does not exist" | `package.json`'s `publisher` field doesn't match the claimed Marketplace publisher ID (case-sensitive at the URL level despite Microsoft's case-insensitive lookup elsewhere) | Update `package.json`'s `publisher` to match what's claimed on the Marketplace; bump the patch version; retag. |
| `publish-marketplace` skipped on a tag you expected to publish | The classify job decided the tag wasn't a final release — likely you tagged with an RC suffix (`vsix-v1.0.0-rc1`) | Tag with `vsix-vX.Y.Z` (no suffix). RC tags only build, by design. |
| `publish-openvsx` fails with "namespace not authorized" | Open VSX namespace not yet linked to the operator's GitHub account, or `OVSX_PAT` was minted under a different account | Confirm namespace ownership at `open-vsx.org/user-settings/namespaces`; mint a new `OVSX_PAT` from the correct account; update the `openvsx` environment secret. |
| Marketplace listing shows the new version but `code --install-extension` resolves to the old version | Marketplace CDN cache; usually clears in 1-5 minutes. Check the listing's "Version History" tab to confirm the new version is on disk | Wait, retry. If still wrong after 15 minutes, file a Marketplace support ticket. |
| The build artifact is missing files you expected in the VSIX (e.g., `media/`, README) | `package.json`'s `files` field (if used) excludes them, or `.vscodeignore` is too aggressive | Inspect the VSIX directly: `unzip -l <vsix>`. Update `.vscodeignore` / `package.json` `files`, retag with the next patch version. |

---

## Maintenance: keeping the workflow green

- **PAT rotation cadence: at least annually.** The PAT minted in
  one-time-setup step 3 is the only long-lived secret. Calendar a
  rotation 30 days before expiry; the failure mode if rotation
  slips is "next publish fails with token error" — recoverable but
  visible.
- **Pinned actions** (`actions/checkout@v4`, `actions/setup-node@v4`,
  `actions/upload-artifact@v4`, `actions/download-artifact@v4`) should
  be reviewed every ~6 months. Major-version bumps occasionally
  include breaking changes; minor bumps are safe via the major-version
  float.
- **Node version** in `setup-node` (currently `20`) controls the
  build-time runtime. The extension's runtime requirement is
  VS Code's bundled Node, which moves on its own cadence —
  `engines.vscode` in `package.json` is the runtime gate. There's no
  benefit to building under multiple Node versions for a pure-JS
  extension.
- **`.vscodeignore`** controls what doesn't ship in the VSIX. Review
  it when adding new top-level directories under
  `tools/dabbler-ai-orchestration/`.
- **Marketplace publisher ownership** transfer: if the human
  custodian of the publisher account changes, the new custodian opens
  a Microsoft support ticket to transfer ownership. The ticket is
  manual; allow a few days lead time. Update this doc and any
  references when ownership transfers.
- **When OIDC support lands on the Marketplace,** migrate. PyPI's
  release.yml is the reference shape; `pypa/gh-action-pypi-publish`
  is the analog upstream action would be authored as
  `microsoft/vsce-publish` or similar. File a follow-up issue with
  the upstream announcement link when that lands.
