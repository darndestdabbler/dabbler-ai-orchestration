# Cross-provider verification — Set 10 Session 2: Publish `dabbler-ai-router` to PyPI via GitHub Actions OIDC trusted publishing

## Spec excerpt for Session 2
```markdown
### Session 2 of 3: Publish to PyPI via GitHub Actions

**Goal:** First release of `dabbler-ai-router` on PyPI, via an
auditable, repeatable release workflow that does not require API
tokens in repo secrets.

**Recommended path: OIDC trusted publishing.** PyPI supports
GitHub-OIDC-based trusted publishing as of 2023 — the GitHub Actions
runner authenticates to PyPI via short-lived tokens minted on each
run, scoped to a specific repo + workflow + environment. No API
token sits in `secrets.PYPI_TOKEN` to leak. The PyPI project is
configured once in its settings page to trust
`darndestdabbler/dabbler-ai-orchestration` + the release workflow
file path.

**Steps:**

1. Author `.github/workflows/release.yml`:
   - Trigger: `on: push: tags: ['v*']`.
   - Permissions: `id-token: write` for OIDC, `contents: read`.
   - Job 1: build `sdist` + `wheel` via `python -m build`. Upload
     as workflow artifacts.
   - Job 2 (depends on Job 1): publish to TestPyPI first via
     `pypa/gh-action-pypi-publish@release/v1` for sanity-check.
     Only runs on tags that match `v*-rc*` (release candidates). For
     final tags (matching `v[0-9]+.[0-9]+.[0-9]+` exactly) this job
     is skipped.
   - Job 3 (depends on Job 1): publish to PyPI proper for final
     tags. Uses the same action + OIDC flow.
   - Environment: protect both publish jobs behind a deployment
     environment (`pypi` / `testpypi`) so the human-approval flow on
     each tag is configurable from the GitHub UI.
2. Author `docs/planning/release-process.md` (new file) covering:
   - One-time PyPI account setup (project namespace claim, OIDC
     trusted publisher config — link to the PyPI docs page rather
     than duplicating their content).
   - Per-release checklist: bump `pyproject.toml` `version`, write
     change-notes, `git tag vX.Y.Z`, `git push --tags`, watch the
     workflow run, verify on PyPI.
   - Rollback: PyPI does not allow re-uploading a deleted version;
     the rollback path is `vX.Y.(Z+1)` with a hotfix.
3. Tag and release `v0.1.0` (or `v0.1.0-rc1` first to exercise the
   TestPyPI path; recommend RC first the first time the workflow
   runs).
   - This is a **human-driven step**: the orchestrator authors the
     workflow file and the release process doc, but the human
     pushes the tag, watches the GitHub Actions run, and confirms
     the package appears on PyPI. The session's close-out summary
     surfaces this handoff explicitly.
4. Verify in a clean venv (post-release): `pip install
   dabbler-ai-router==0.1.0` → `python -c "import ai_router;
   print(ai_router.__version__)"`. If this works, the publish path
   is proven.
5. Update repo-root `README.md` adoption section: the "Adopting
   `ai-router` in a project" section can collapse from its current
   60-line walkthrough to roughly:
   ```
   python -m venv .venv
   .venv/Scripts/pip install dabbler-ai-router
   ```
   Plus a few lines on `router-config.yaml` tuning and where to put
   API keys. The full importlib-shim block goes away (along with the
   "consumer repo" framing — by this point in the spec, that
   framing is already softened in Session 1's README touch-ups).
6. End-of-session cross-provider verification.
7. Commit, push, run close-out.

**Creates:** `.github/workflows/release.yml`,
`docs/planning/release-process.md`.

**Touches:** `pyproject.toml` (version bump if needed);
`README.md` (adoption section collapse);
`tools/dabbler-ai-orchestration/README.md` (add a note that v0.1+ is
on PyPI and the install command in Session 3 will use it).

**Ends with:** the release workflow file is committed; the release
process doc is published; either (a) v0.1.0 is on PyPI and
`pip install dabbler-ai-router` works, OR (b) the orchestrator's
close-out summary states explicitly that the human-driven
tag-push step is pending and Session 3 should wait for confirmation
before assuming PyPI is live.

**Progress keys:** `.github/workflows/release.yml` exists;
`docs/planning/release-process.md` exists; the README adoption
section length has dropped substantially (signal that the collapse
landed).

---


```

## Pre-session check completed during this session

**PyPI name availability.** `dabbler-ai-router` is available on PyPI as of 2026-05-02 — `httpx.get('https://pypi.org/pypi/dabbler-ai-router/json')` returned status 404. No fallback name needed; the spec's risk-section fallbacks (`dabbler-airouter`, `dabbler-router`) are not invoked. Recorded in the release-process doc's Naming section.

## Deliverables

### 1. New `.github/workflows/release.yml` (OIDC trusted publishing)

```yaml
name: Release dabbler-ai-router to PyPI

# OIDC trusted publishing (no API tokens in repo secrets).
# See `docs/planning/release-process.md` for one-time setup and the
# per-release checklist. Triggered on tag push:
#
#   - `vX.Y.Z-rcN` (e.g. `v0.1.0-rc1`) -> TestPyPI only.
#   - `vX.Y.Z`     (e.g. `v0.1.0`)     -> PyPI proper.
#
# Anything else (e.g. `v1.0.0rc1`, `v1.2`, `vfoo`) is rejected by the
# `classify` job before any artifact build runs.
#
# The build job runs after `classify` so artifacts exist for inspection
# even if the publish step is gated by environment review.

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read

jobs:
  # ---------------------------------------------------------------------------
  # Classify the pushed tag into one of {final, rc, invalid}. Final and
  # RC tags must match the strict regexes below; anything else fails the
  # workflow before any build/publish work happens. The classification
  # outputs gate the downstream publish jobs so they cannot fire for
  # the wrong tag shape (e.g., a final tag accidentally also satisfying
  # the RC condition).
  # ---------------------------------------------------------------------------
  classify:
    name: Classify tag
    runs-on: ubuntu-latest
    outputs:
      is_final: ${{ steps.classify.outputs.is_final }}
      is_rc: ${{ steps.classify.outputs.is_rc }}
      pep440_version: ${{ steps.classify.outputs.pep440_version }}
    steps:
      - name: Classify ${{ github.ref_name }}
        id: classify
        run: |
          tag="${GITHUB_REF#refs/tags/}"
          if [[ "$tag" =~ ^v([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
            echo "is_final=true"  >> "$GITHUB_OUTPUT"
            echo "is_rc=false"    >> "$GITHUB_OUTPUT"
            echo "pep440_version=${BASH_REMATCH[1]}" >> "$GITHUB_OUTPUT"
            echo "Tag $tag classified as FINAL (PEP 440 version ${BASH_REMATCH[1]})."
          elif [[ "$tag" =~ ^v([0-9]+\.[0-9]+\.[0-9]+)-rc([0-9]+)$ ]]; then
            echo "is_final=false" >> "$GITHUB_OUTPUT"
            echo "is_rc=true"     >> "$GITHUB_OUTPUT"
            # PEP 440 normalizes `0.1.0-rc1` to `0.1.0rc1` (no dash).
            echo "pep440_version=${BASH_REMATCH[1]}rc${BASH_REMATCH[2]}" >> "$GITHUB_OUTPUT"
            echo "Tag $tag classified as RC (PEP 440 version ${BASH_REMATCH[1]}rc${BASH_REMATCH[2]})."
          else
            echo "::error::tag $tag does not match the release pattern. Expected v[0-9]+.[0-9]+.[0-9]+ for finals or v[0-9]+.[0-9]+.[0-9]+-rcN for release candidates."
            exit 1
          fi

  # ---------------------------------------------------------------------------
  # Build sdist + wheel. Uploaded as a workflow artifact so the publish
  # jobs (and any human reviewing the release) can inspect the same bytes
  # that go to PyPI.
  # ---------------------------------------------------------------------------
  build:
    name: Build sdist + wheel
    needs: classify
    runs-on: ubuntu-latest
    steps:
      - name: Checkout tag
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install build tooling
        run: python -m pip install --upgrade pip build packaging

      - name: Verify tag matches pyproject.toml version
        # Catches the "tagged v0.1.1 but forgot to bump pyproject.toml"
        # mistake before we waste a build/publish cycle. The check
        # compares the PEP 440 version the classify job derived from
        # the tag (`v0.1.0` -> `0.1.0`, `v0.1.0-rc1` -> `0.1.0rc1`)
        # against the canonicalized version from pyproject.toml. Using
        # `packaging.version.Version` on both sides catches any
        # subtle PEP 440 normalization differences.
        env:
          EXPECTED_VERSION: ${{ needs.classify.outputs.pep440_version }}
        run: |
          python <<'PY'
          import os, sys, tomllib
          from packaging.version import Version
          expected = os.environ["EXPECTED_VERSION"]
          with open("pyproject.toml", "rb") as f:
              pyproject_version = tomllib.load(f)["project"]["version"]
          # `Version()` normalizes both sides to canonical PEP 440 form,
          # so `0.1.0rc1` and `0.1.0-rc1` and `0.1.0.rc1` all compare
          # equal — the Version class is the source of truth here.
          if Version(expected) != Version(pyproject_version):
              print(
                  f"::error::tag PEP 440 version {expected!r} does not "
                  f"match pyproject.toml [project].version {pyproject_version!r}",
                  file=sys.stderr,
              )
              sys.exit(1)
          print(f"tag-vs-pyproject check OK: {expected} == {pyproject_version}")
          PY

      - name: Build sdist + wheel
        run: python -m build

      - name: Upload dist artifact
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          if-no-files-found: error
          retention-days: 7

  # ---------------------------------------------------------------------------
  # TestPyPI publish — release-candidate tags only (`v[0-9]+.[0-9]+.[0-9]+-rcN`).
  # Lets the release workflow exercise the full upload path against
  # TestPyPI before the equivalent run against PyPI proper. TestPyPI
  # rejects re-uploads of the same version, so each RC must bump the
  # suffix (rc1, rc2, ...).
  # ---------------------------------------------------------------------------
  publish-testpypi:
    name: Publish to TestPyPI (release candidates only)
    needs: [classify, build]
    if: ${{ needs.classify.outputs.is_rc == 'true' }}
    runs-on: ubuntu-latest
    environment:
      name: testpypi
      url: https://test.pypi.org/p/dabbler-ai-router
    permissions:
      id-token: write   # required for OIDC trusted publishing
    steps:
      - name: Download dist artifact
        uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/

      - name: Publish to TestPyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          repository-url: https://test.pypi.org/legacy/
          # No `password:` — OIDC mints a short-lived token from the
          # trusted-publisher config in the TestPyPI project settings.

  # ---------------------------------------------------------------------------
  # PyPI publish — final tags only (`v[0-9]+.[0-9]+.[0-9]+` exactly).
  # The classify job already rejected anything else, so this gate is a
  # belt-and-suspenders check: even if `classify` ever evolves, an RC
  # tag cannot end up here.
  # ---------------------------------------------------------------------------
  publish-pypi:
    name: Publish to PyPI (final releases only)
    needs: [classify, build]
    if: ${{ needs.classify.outputs.is_final == 'true' }}
    runs-on: ubuntu-latest
    environment:
      name: pypi
      url: https://pypi.org/p/dabbler-ai-router
    permissions:
      id-token: write   # required for OIDC trusted publishing
    steps:
      - name: Download dist artifact
        uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/

      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        # No `repository-url:` — defaults to https://upload.pypi.org/legacy/.
        # No `password:` — OIDC mints the short-lived token from the
        # trusted-publisher config in the PyPI project settings.

```

### 2. New `docs/planning/release-process.md` (release runbook)

```markdown
# Release process — `dabbler-ai-router` to PyPI

> **Purpose:** The single source of truth for shipping a new version of
> the `dabbler-ai-router` Python package to PyPI via the OIDC
> trusted-publishing workflow at
> [`.github/workflows/release.yml`](../../.github/workflows/release.yml).
>
> **Audience:** The human who pushes the release tag. The workflow runs
> automatically; this doc covers the parts that aren't automated — the
> one-time PyPI / TestPyPI configuration, the per-release checklist, and
> the rollback path when something goes wrong.

---

## Why OIDC trusted publishing (not API tokens)

PyPI supports GitHub-OIDC-based trusted publishing as of 2023. The
GitHub Actions runner authenticates to PyPI on every release by minting
a short-lived (~15-minute) token from a trust relationship configured
once in the PyPI project's settings. There is no long-lived
`PYPI_TOKEN` in `secrets`, so a leaked or compromised secret cannot
result in a malicious upload. The trust relationship is scoped to a
specific repository + workflow file + (optional) deployment
environment, so even a compromise of an unrelated repo cannot publish
to this project.

PyPI's reference for trusted publishing:
[`docs.pypi.org/trusted-publishers/`](https://docs.pypi.org/trusted-publishers/).
Read it once before doing the one-time setup below; this doc only
captures the project-specific bits.

---

## Naming

- **PyPI package name:** `dabbler-ai-router`. Confirmed available on
  PyPI as of 2026-05-02 (`https://pypi.org/pypi/dabbler-ai-router/json`
  returned 404). If a future release ever finds the name claimed —
  PyPI does allow takeover requests in some abandoned-package
  scenarios, but the practical fallback is to ship under a different
  name — the resolution path is `dabbler-airouter` (no internal hyphen)
  or `dabbler-router`. Update this doc and `pyproject.toml` together.
- **Python import name:** `ai_router`. Independent of the PyPI name
  (`pip install pyyaml` → `import yaml` is the same pattern).
- **First release:** `v0.1.0`. The 0.x series explicitly signals "API
  may change between minor versions" while the package finds its shape
  on PyPI. Promotion to 1.0 is a separate, deliberate decision.

---

## One-time setup (do this before the first release)

### 1. Register the project on PyPI and TestPyPI

Both PyPI (`pypi.org`) and TestPyPI (`test.pypi.org`) require a project
to exist before its trusted-publisher relationship can be configured.
Three options for first registration:

- **Recommended: pre-register via "Add a pending publisher"** (no
  upload needed). PyPI added support for this in 2023 specifically so
  trusted publishing can be configured before the first release. Each
  side (PyPI + TestPyPI) has a "Your projects → Pending publishers"
  page.
- Alternatively, do an initial manual upload (one time only) using a
  short-lived API token. Delete the token immediately after.
- Alternatively, ship a `v0.1.0-rc1` to TestPyPI first via the
  pending-publisher flow, then graduate to PyPI once the workflow has
  proved itself end-to-end.

This repo's release plan goes with the first option for both
registries.

### 2. Configure the PyPI trusted publisher

On `pypi.org`:

- Owner: log in to the PyPI account that will own `dabbler-ai-router`.
- Navigate to **Your projects → Pending publishers → Add a new
  publisher**.
- Fill in:

  | Field | Value |
  |---|---|
  | PyPI project name | `dabbler-ai-router` |
  | Owner | `darndestdabbler` |
  | Repository name | `dabbler-ai-orchestration` |
  | Workflow filename | `release.yml` |
  | Environment name | `pypi` |

  The environment name **must match** the `environment.name` in the
  publish-pypi job. If the workflow ever moves to a different
  environment name, both sides must update in lockstep — the trusted
  publisher won't issue a token to a job in the wrong environment.

- Click **Add**. The publisher is now "pending" and will activate when
  the first release run uploads bytes.

### 3. Configure the TestPyPI trusted publisher

Same flow on `test.pypi.org`. The values are identical except:

| Field | Value |
|---|---|
| PyPI project name | `dabbler-ai-router` |
| Environment name | `testpypi` |

TestPyPI is a separate account from PyPI; if you don't have one, sign
up at `test.pypi.org/account/register/` first. Use a different
password from PyPI; both registries require email verification.

### 4. Configure the GitHub deployment environments

On `github.com/darndestdabbler/dabbler-ai-orchestration` →
**Settings → Environments**, create two environments:

- **`pypi`** — for production releases.
  - Recommended: add a required reviewer (yourself) so each PyPI
    release prompts a one-click approval click before the publish job
    runs. The TestPyPI run on the matching `-rc*` tag is the dry run;
    the final-tag PyPI publish should be a deliberate human-in-the-loop
    action even when the bytes are already known-good.
  - Do not add long-lived secrets to this environment. OIDC handles
    auth.

- **`testpypi`** — for release candidates.
  - Optional: skip the required-reviewer setting. RCs are by nature
    cheap-to-redo; manual approval each time becomes friction.
  - Do not add long-lived secrets here either.

### 5. Verify by publishing a release candidate

The workflow's RC and final tag patterns (enforced by the `classify`
job) are:

- **RC tag:** `v[0-9]+.[0-9]+.[0-9]+-rcN` exactly. Examples: `v0.1.0-rc1`,
  `v0.1.0-rc2`, `v0.2.0-rc1`. The dash before `rc` is part of the git
  tag spelling. PEP 440 normalizes the wheel's version to drop the
  dash (`0.1.0rc1`), so `pyproject.toml` must carry the dashless form.
- **Final tag:** `v[0-9]+.[0-9]+.[0-9]+` exactly. Example: `v0.1.0`.

Anything else (`v1.0.0rc1` without the dash, `v1.2`, `vfoo`, ...)
fails the `classify` job before any artifact build runs.

For an RC, set `pyproject.toml` to the **dashless** PEP 440 version
(e.g. `version = "0.1.0rc1"`), then tag and push:

```bash
git tag v0.1.0-rc1
git push --tags
```

The release workflow then:

1. Classifies the tag as RC (PEP 440 version `0.1.0rc1`).
2. Builds the sdist + wheel and verifies the PEP 440 version
   matches `pyproject.toml`'s `[project].version`.
3. Triggers the `publish-testpypi` job because `is_rc == 'true'`.
4. Mints an OIDC token from TestPyPI's pending publisher and uploads.

The `publish-pypi` job is skipped because `is_final == 'false'`.
Verify by:

```bash
python -m venv /tmp/rcverify && source /tmp/rcverify/bin/activate
pip install --index-url https://test.pypi.org/simple/ \
            --extra-index-url https://pypi.org/simple/ \
            dabbler-ai-router==0.1.0rc1
python -c "import ai_router; print(ai_router.__version__)"  # -> 0.1.0rc1
```

> The version-style asymmetry — git tag `v0.1.0-rc1` (with dash) vs
> wheel/`pyproject.toml` `0.1.0rc1` (no dash) — is **PEP 440's
> normalization, not a bug.** The `Version()` comparison in the
> tag-vs-pyproject check uses the same normalization, so both sides
> have to agree on the canonical form. If the check fails, the most
> common cause is `pyproject.toml` still saying `0.1.0` while the tag
> is `v0.1.0-rc1`.

If this works, the trusted-publisher config is correct on the TestPyPI
side. The PyPI side proves itself on the first `vX.Y.Z` final tag.

---

## Per-release checklist

Run through this every time. The whole loop takes ~10 minutes if
nothing goes wrong.

1. **Decide the version.** Bump per semver:
   - `0.x.y` → `0.x.(y+1)` for fixes
   - `0.x.y` → `0.(x+1).0` for new features (this is the common case
     while the API is still settling — no API stability guarantees in
     the 0.x range)
   - `0.x.y` → `1.0.0` only when the maintainer explicitly commits to
     API stability. Don't slide into 1.0 by accident.

2. **Update `pyproject.toml`.** Edit the `version` field. The release
   workflow's first job verifies the tag matches this string; a mismatch
   exits the run before any upload.

3. **Author release notes.** Most releases earn a short
   `## vX.Y.Z (YYYY-MM-DD)` section in `CHANGELOG.md` (or, if the repo
   doesn't carry one yet, in the GitHub release body when the tag is
   created via `gh release create`). Capture: what changed, what
   adopters need to do, any breaking changes (rare in 0.x).

4. **Commit `pyproject.toml` + release notes.**

   ```bash
   git add pyproject.toml CHANGELOG.md
   git commit -m "Bump version to vX.Y.Z"
   git push origin master
   ```

5. **(Optional) RC dry run.** If the change touches the publish
   pipeline itself, the package layout, or the `[project.scripts]`
   entries — anything that could break the publish path — ship a
   `-rcN` tag first and watch the TestPyPI run before the final tag.
   Set `pyproject.toml` to the **dashless PEP 440** version
   (`X.Y.ZrcN`), commit, then:

   ```bash
   git tag vX.Y.Z-rc1   # dash in the git tag spelling
   git push --tags
   ```

   Watch
   `https://github.com/darndestdabbler/dabbler-ai-orchestration/actions`
   for green. Verify the wheel installs from TestPyPI as in
   "Verify by publishing a release candidate" above. If anything is
   wrong, bump the suffix (`-rc2`) — TestPyPI will not let you reuse a
   version, even an RC one. Before the **final** tag, change
   `pyproject.toml` back to the dashless final form (`X.Y.Z`) — both
   the version field and the git tag have to agree, and the `classify`
   job fails the workflow loudly when they don't.

6. **Tag and push the final release.**

   ```bash
   git tag vX.Y.Z
   git push --tags
   ```

7. **Approve the deployment.** GitHub will email / show a notification
   that the `pypi` environment is awaiting review. Click through to
   the run, click **Review deployments**, check `pypi`, click
   **Approve and deploy**.

8. **Verify on PyPI.** ~30 seconds after approval, the package is live
   at `https://pypi.org/project/dabbler-ai-router/X.Y.Z/`. Smoke test
   in a fresh venv (use a different machine or a temp container if
   you want a really clean check):

   ```bash
   python -m venv /tmp/relverify && source /tmp/relverify/bin/activate
   pip install dabbler-ai-router==X.Y.Z
   python -c "import ai_router; print(ai_router.__version__)"  # -> X.Y.Z
   close_session --help  # confirms the [project.scripts] entries land
   ```

   If both succeed, the release is shipped.

9. **Create the GitHub release** (optional, for changelog visibility):

   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-from-tag
   ```

   Or write the notes inline. The trusted-publisher run already
   uploaded bytes; this step is purely for the GitHub-side
   release-list UX.

10. **Update consumer repos.** Bump `dabbler-ai-router` in any repo
    that pins it. `dabbler-access-harvester` and `dabbler-platform` are
    the current consumers (per `CLAUDE.md`). After Session 3 of set 010
    lands, the consumer-side install path is also `Dabbler: Install
    ai-router` from inside the VS Code extension; that flow ends up
    calling `pip install dabbler-ai-router` under the hood.

---

## Rollback

PyPI **does not allow re-uploading a deleted version.** Once
`vX.Y.Z` is on PyPI, that version number is burned. The two
practical rollback paths:

- **Patch forward.** Cut `vX.Y.(Z+1)` with the fix. Common case.
- **Yank the broken version.** From the PyPI project's "Manage" page,
  yank `vX.Y.Z`. `pip install dabbler-ai-router` no longer resolves
  it by default, but `pip install dabbler-ai-router==X.Y.Z` still
  works for explicit pins (so existing lockfiles don't break). Yanking
  is non-destructive — bytes stay on disk, just hidden from
  resolver-default-latest. Use it when the broken version is actively
  hurting people.

Yanking is documented at
[`packaging.python.org/specifications/pep-592/`](https://packaging.python.org/en/latest/specifications/pep-592/).

---

## Failure modes and how to recognize them

| Symptom | Likely cause | Fix |
|---|---|---|
| Workflow fails at "Verify tag matches pyproject.toml version" | Pushed the tag before bumping `pyproject.toml`, or pushed an RC tag while `pyproject.toml` still has the final dashless version (or vice versa) | Delete the tag locally + remote (`git tag -d vX.Y.Z; git push --delete origin vX.Y.Z`), bump or fix `pyproject.toml` to match the **PEP 440 normalized** form of the tag (`vX.Y.Z` -> `X.Y.Z`, `vX.Y.Z-rcN` -> `X.Y.ZrcN`), commit, retag. |
| Workflow fails at the `classify` job with "tag does not match the release pattern" | Tag spelling doesn't match `v[0-9]+.[0-9]+.[0-9]+` or `v[0-9]+.[0-9]+.[0-9]+-rcN` exactly (e.g., `v1.2`, `v1.0.0rc1` without the dash, `vfoo`) | Re-tag with the canonical spelling. The dash before `rc` in the git tag is required; PEP 440's dashless `1.0.0rc1` is the wheel/`pyproject.toml` form, not the git tag form. |
| `publish-testpypi` fails with "invalid token" | Trusted publisher not configured for the `testpypi` environment, OR the env name in `release.yml` doesn't match the env name in TestPyPI's pending-publisher form | Re-check the four fields in TestPyPI → Manage → Publishing. The environment name is the most common mismatch. |
| `publish-pypi` skipped on a tag you expected to publish | The classify job decided the tag wasn't a final release — likely you tagged with an RC suffix (`v1.0.0-rc1`) or a non-canonical spelling | Tag with `vX.Y.Z` (no suffix). Anything else routes to TestPyPI or fails the classify job. |
| `pip install dabbler-ai-router` resolves to the old version after a release | PyPI's CDN cache; usually clears in <30 seconds. Check the project page directly to confirm the new version is listed | Wait, retry. If still wrong after 5 minutes, file a PyPI support ticket. |
| The build artifact has files you don't want in the wheel | `[tool.setuptools.package-data]` or `MANIFEST.in` mis-spec'd | Inspect the artifact (downloadable from the workflow run page). Update `pyproject.toml`, retag with the next patch version. |

---

## Maintenance: keeping the workflow green

- The pinned actions (`actions/checkout@v4`, `actions/setup-python@v5`,
  `actions/upload-artifact@v4`, `actions/download-artifact@v4`,
  `pypa/gh-action-pypi-publish@release/v1`) should be reviewed every
  ~6 months. Major-version bumps occasionally include breaking
  changes; minor bumps are safe via the major-version float.
- The Python version in `setup-python` (currently `3.11`) controls the
  build-time interpreter. The package's runtime requirement
  (`requires-python = ">=3.10"`) is independent. There's no benefit to
  building under multiple Python versions for a pure-Python package.
- `[tool.setuptools.package-data]` lists the non-`*.py` resources that
  ship in the wheel. When new resource directories or file types are
  added under `ai_router/`, update that block in `pyproject.toml`
  (and `MANIFEST.in` if the project ever grows one) so the resources
  actually land in the install.

```

### 3. README.md — Adopting section collapsed to one-liner + tuning + first-set

Section was a 60-line walkthrough at end of Session 1 (six numbered steps walking through copying `ai_router/` and `pyproject.toml`, setting API keys, `pip install -e .`, importing, tuning, authoring first set). Now collapsed to the spec's target shape: one fenced block with the install command + import line + a short bulleted list (API keys, tuning, first set), plus two foot-notes (editable / source install for fork-trackers, and a forward-reference to Session 3's `Dabbler: Install ai-router` command).

```markdown
## Adopting `ai_router` in a project

```bash
python -m venv .venv
.venv/Scripts/pip install dabbler-ai-router
```

That installs the router as a regular Python package. From your
orchestrator script:

```python
from ai_router import route
```

Then:

- **Set API keys** as environment variables:
  `ANTHROPIC_API_KEY` (Claude Sonnet / Opus), `GEMINI_API_KEY`
  (Gemini Flash / Pro), `OPENAI_API_KEY` (GPT-5.4 / GPT-5.4 Mini),
  and optionally `PUSHOVER_API_KEY` / `PUSHOVER_USER_KEY` for
  end-of-session phone notifications. On Windows, User environment
  variables work; the notification helper falls back to the Windows
  User/Machine environment if the process environment doesn't already
  have the Pushover keys.
- **Tune `router-config.yaml`** for your project — the file is shipped
  as package data inside `ai_router/`, but the production overlay
  pattern is to copy it into your repo root (or anywhere on the
  config-search path) and edit there. Per-task-type effort levels, the
  cost guard for verification, and `delegation.always_route_task_types`
  all live there.
- **Author your first session set:** create
  `docs/session-sets/<slug>/spec.md` with a Session Set Configuration
  block (see [docs/planning/session-set-authoring-guide.md](docs/planning/session-set-authoring-guide.md))
  and start it with `Start the next session.`.

> ### Editable / source-install fallback
>
> If you need to track an unreleased `master` (or run a fork), clone
> the repo and install editably:
>
> ```bash
> git clone https://github.com/darndestdabbler/dabbler-ai-orchestration.git
> cd dabbler-ai-orchestration
> python -m venv .venv
> .venv/Scripts/pip install -e .
> ```
>
> Same import (`from ai_router import route`); the editable install
> picks up local edits to `ai_router/` without a reinstall.

> ### From inside VS Code (post-Set-010-Session-3)
>
> Once the **Session Set Explorer** extension's `Dabbler: Install
> ai-router` command lands (Session 3 of set 010), the install path
> from inside VS Code is the command palette plus one click. The
> command runs `pip install dabbler-ai-router` against your workspace
> venv and is the recommended path for end users — it preserves any
> existing `router-config.yaml` and surfaces the tuning file in an
> editor when the install completes.

---


```

### 4. tools/dabbler-ai-orchestration/README.md — Requirements section update

Added a v0.1+ PyPI note to the existing Requirements section (does not duplicate the README adoption section; just makes the install path explicit and forward-references Session 3's install command).

```markdown
## Requirements

- VS Code 1.85 or later
- Git on your PATH
- Python ≥ 3.10 with the `ai_router` module installed in your project's
  venv. As of v0.1, install via `pip install dabbler-ai-router` (the
  upcoming `Dabbler: Install ai-router` command — Session 3 of set 010
  — will run this for you against the workspace venv and surface the
  `router-config.yaml` tuning file when it lands).
- At least one API key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`


```

### 5. pyproject.toml — packaging tightening

Discovered during a local `python -m build` smoke test that the wheel was including all 35 files under `ai_router/tests/` (80 total entries vs the expected 45). The cause: `ai_router/tests/` lacks `__init__.py` and `[tool.setuptools.packages.find]` was discovering it under PEP 420 implicit namespace handling. Fix: explicit `exclude = ["ai_router.tests", "ai_router.tests.*"]` plus `namespaces = false` blocks both discovery paths. Post-fix wheel: 45 entries, 0 test files; package data (router-config.yaml, prompt-templates/*.md, schemas/*.json, docs/*.md) is preserved; `[project.scripts]` entries unchanged. Also added a `MANIFEST.in` for the sdist (mirrors the same exclude on the source-distribution side).

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "dabbler-ai-router"
version = "0.1.0"
description = "Multi-provider model routing, prompt templates, session state, and metrics for the Dabbler AI-led-workflow."
readme = "README.md"
license = "MIT"
requires-python = ">=3.10"
authors = [
    { name = "darndestdabbler" },
]
keywords = ["ai", "router", "claude", "gemini", "openai", "session", "workflow"]
classifiers = [
    "Development Status :: 4 - Beta",
    "Intended Audience :: Developers",
    "Operating System :: OS Independent",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3 :: Only",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
    "Topic :: Software Development :: Libraries :: Python Modules",
]
dependencies = [
    "pyyaml>=6.0",
    "httpx>=0.27.0",
]

[project.optional-dependencies]
tests = [
    "pytest>=7.0",
    "jsonschema>=4.0.0",
]

[project.urls]
Homepage = "https://github.com/darndestdabbler/dabbler-ai-orchestration"
Source = "https://github.com/darndestdabbler/dabbler-ai-orchestration"
Issues = "https://github.com/darndestdabbler/dabbler-ai-orchestration/issues"

[project.scripts]
close_session = "ai_router.close_session:main"
report = "ai_router.report:main"
reconciler = "ai_router.reconciler:main"
queue_status = "ai_router.queue_status:main"
heartbeat_status = "ai_router.heartbeat_status:main"
restart_role = "ai_router.restart_role:main"
backfill_session_state = "ai_router.backfill_session_state:main"

[tool.setuptools.packages.find]
where = ["."]
include = ["ai_router*"]
# Tests live under ai_router/tests/ so the test suite can run via the
# package's own conftest. They are not part of the public API and
# should not bloat the installed wheel. The directory has no
# __init__.py, so under PEP 420 it would otherwise be picked up as an
# implicit namespace package; ``namespaces = false`` plus the explicit
# excludes block both discovery paths.
exclude = ["ai_router.tests", "ai_router.tests.*"]
namespaces = false

[tool.setuptools.package-data]
ai_router = [
    "router-config.yaml",
    "prompt-templates/*.md",
    "schemas/*.json",
    "docs/*.md",
]

```

**MANIFEST.in:**

```
include README.md
include LICENSE
include pyproject.toml
recursive-include ai_router *.py *.yaml *.md *.json
prune ai_router/tests
prune ai_router/__pycache__
recursive-exclude ai_router *.pyc

```

### 6. ai-assignment.md — Session 2 block + Session 1 actuals appended

```markdown
# AI Assignment Ledger — 010-pypi-publish-and-installer

> **Note on routing for this set.** Standing operator instruction
> (recorded in orchestrator memory, 2026-05-01) restricts ai-router
> usage to end-of-session cross-provider verification only. The
> "always route, never self-opine" rule (workflow Rule 17) is
> deliberately suspended for the duration of this constraint, and the
> per-session `Recommended orchestrator`, `Rationale`, and
> `Next-session orchestrator recommendation` blocks below were
> authored directly by the orchestrator without a routed
> `task_type="analysis"` call. Once the constraint is lifted, future
> sets should resume routed authoring; the deviation is recorded in
> the actuals on each session's block.

---

## Session 1: Rename `ai-router/` → `ai_router/`, add `pyproject.toml`

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
The work is mechanical-but-broad: a directory rename plus
forward-looking path-string updates across ~30–40 forward-facing
tracked files (instruction files, the workflow doc, the README, a
handful of planning docs, the scripts/verify_session_*.py importlib
shim, a few TS sources, the verifier prompt template, the
session-state schema example doc, plus internal Python references
inside the renamed package). Authoring `pyproject.toml` to the modern
PEP 621 schema and wiring `[project.scripts]` for the seven existing
CLI surfaces requires careful attention to entry points but no
architectural reasoning. Opus at high effort handles the
careful-wording demand on the prose updates and the test-suite
re-run cleanly; Sonnet at medium effort would also suffice for the
mechanical surface but the prose-quality bar in the agent-instruction
files and the workflow doc tips the call to Opus.

### Estimated routed cost
None this session — only end-of-session verification routes (per the
standing operator constraint).

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (spec, current `ai-router/` layout, `pytest.ini`, agent files) | Direct (orchestrator) |
| 2 | Register Session 1 start (write `session-state.json`) | Direct (file-write helper, no API call) |
| 3 | Author this `ai-assignment.md` | Direct (router suspended per operator) |
| 4 | `git mv ai-router ai_router` | Direct (shell command) |
| 5 | Update `pytest.ini` testpaths | Direct (mechanical edit) |
| 6 | Update internal references inside the renamed `ai_router/` (Python files, docs, schemas, config) | Direct (mechanical find-and-replace) |
| 7 | Update `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` path references | Direct (mechanical edit) |
| 8 | Update `README.md` file map + forward-looking path references in adoption section | Direct (mechanical edit; full collapse of adoption section is Session 3 work) |
| 9 | Update `docs/ai-led-session-workflow.md` path references and the importlib-shim block | Direct (mechanical edit) |
| 10 | Update `docs/planning/repo-worktree-layout.md` and `docs/planning/lessons-learned.md` path references | Direct (mechanical edit) |
| 11 | Update `docs/session-state-schema-example.md` path references | Direct (mechanical edit) |
| 12 | Update `scripts/verify_session_*.py` to use `ai_router` (drop importlib shim where possible) | Direct (mechanical edit) |
| 13 | Update `tools/dabbler-ai-orchestration` TypeScript sources + README path references | Direct (mechanical edit) |
| 14 | Author `pyproject.toml` at repo root (PEP 621 schema, `[project.scripts]` for 7 CLIs) | Direct (mechanical authoring against spec) |
| 15 | Smoke test: `pip install -e .` in fresh venv + `python -c "import ai_router"` | Direct (shell command) |
| 16 | Run full pytest suite (target: 676 passing → 676 passing) | Direct (shell command) |
| 17 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 18 | Commit, push, run `close_session.py` and stamp Session 1 closed | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high (matches recommendation)
- Total routed cost: $0.3254 — three rounds of `session-verification`
  via gpt-5-4 ($0.0767 + $0.1547 + $0.0941). No analysis routes per
  the standing operator constraint.
- Deviations from recommendation: none. The session ran on the
  recommended orchestrator at the recommended effort.
- Notes for next-session calibration: the verifier flagged 4 Major
  prose / wiring issues across rounds 1–2 (importlib shim still
  present in verify scripts; `[project.scripts]` keys not matching
  spec literal names; literal old path in forward-looking
  historical-context parens; proposal-doc carveout needing explicit
  Path note). All addressed in-session; round 3 returned VERIFIED.
  For Session 2, the `[project.scripts]` literal-name interpretation
  is now baked into `pyproject.toml`, so the release workflow can
  proceed without re-litigating it.

**Next-session orchestrator recommendation (Session 2):**
claude-code claude-opus-4-7 @ effort=high
Rationale: Authoring a GitHub Actions release workflow with OIDC
trusted-publishing semantics + the release-process documentation is
small in line-count but high-stakes (a wrong matrix or a missing
`id-token: write` permission breaks the publish path). Opus at high
effort matches the careful-wording demand for the workflow YAML and
the per-release runbook prose. Sonnet at medium effort would also be
viable; bias toward Opus until the workflow has shipped at least one
successful release.

---

## Session 2: Publish to PyPI via GitHub Actions (OIDC trusted publishing)

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
Authoring `.github/workflows/release.yml` with OIDC trusted-publishing
semantics + the release-process runbook is small in line-count
(~150 YAML + ~200 markdown) but high-stakes: a wrong permissions
block, missing `id-token: write`, or sloppy environment-protection
config breaks the publish path silently or — worse — leaks an
exploit. Opus at high effort matches the careful-wording demand for
the workflow YAML and the per-release runbook prose. The README
adoption-section collapse and the `tools/dabbler-ai-orchestration/README.md`
PyPI-availability note are mechanical follow-ups inside the same
session.

The standing operator constraint suspends Rule #17 routed authoring
of this block; recorded in the Session 1 disposition.

### Estimated routed cost
None this session — only end-of-session verification routes (per the
standing operator constraint).

### Pre-session check completed during this session
PyPI name availability: `dabbler-ai-router` is **available** (HTTPS
GET against `https://pypi.org/pypi/dabbler-ai-router/json` returned
404 on 2026-05-02). No fallback name needed.

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (Session 1 deliverables, current `pyproject.toml`, README adoption section, spec Session 2 block) | Direct (orchestrator) |
| 2 | Register Session 2 start (overwrite `session-state.json`) | Direct (file-write helper, no API call) |
| 3 | Append Session 1 actuals + Session 2 block to `ai-assignment.md` | Direct (router suspended per operator) |
| 4 | Check PyPI name availability for `dabbler-ai-router` | Direct (one-shot HTTPS GET, no API key) |
| 5 | Author `.github/workflows/release.yml` (OIDC trusted publishing, sdist+wheel build, TestPyPI for `-rc*` tags, PyPI for `vX.Y.Z` tags, environment-protected) | Direct (mechanical authoring against spec) |
| 6 | Author `docs/planning/release-process.md` (one-time PyPI/OIDC setup, per-release checklist, rollback section) | Direct (mechanical authoring against spec) |
| 7 | Collapse README adoption section to ~10-line PyPI flow (`pip install dabbler-ai-router` + tuning + first session set), keeping the editable-install fallback for adopters who prefer the source path | Direct (mechanical edit) |
| 8 | Add v0.1+ PyPI-availability note to `tools/dabbler-ai-orchestration/README.md` foreshadowing Session 3's install command | Direct (mechanical edit) |
| 9 | Run full pytest suite (target: still 676 passing — Session 2 changes are doc + workflow only; no Python source touched) | Direct (shell command) |
| 10 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 11 | Author disposition + activity log; commit, push, run `close_session.py`; send notification | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: <filled at close-out>
- Total routed cost: <filled at close-out>
- Deviations from recommendation: <filled at close-out>
- Notes for next-session calibration: <filled at close-out>

**Next-session orchestrator recommendation (Session 3):**
claude-code claude-opus-4-7 @ effort=high
Rationale: Session 3 is the largest single-session estimate in the
set ($0.20–$0.35) — TS command authoring with venv detection,
QuickPick-driven PyPI vs GitHub-sparse-checkout flow,
`router-config.yaml` preservation logic, the graceful "not
configured" tree-item refactor in the Provider Queues / Heartbeats
views, ~12–18 standalone-mocha tests, README updates, and the VSIX
rebuild. The breadth of TS + Python coupling (the install command
must mesh with the views' error-handling refactor) plus the
careful-wording demand on the README's screenshot-led collapse
favor Opus at high effort. Hold this recommendation until the
release workflow has shipped at least one successful publish; if the
human has not yet exercised the release path by the time Session 3
starts, note that in the actuals.

```

## Local build verification

`.venv/Scripts/python.exe -m build --outdir <tmp>/build-test/` produced both `dabbler_ai_router-0.1.0.tar.gz` (sdist) and `dabbler_ai_router-0.1.0-py3-none-any.whl` (wheel) cleanly. Wheel inspection (post packaging-tightening): 45 entries, 0 test files, all expected package data present, entry_points.txt lists the 7 spec-named consoles (`backfill_session_state`, `close_session`, `heartbeat_status`, `queue_status`, `reconciler`, `report`, `restart_role`). The TestPyPI / PyPI publish path against this wheel is what the release workflow will exercise on the first `v0.1.0-rc1` / `v0.1.0` tag push.

## Test-suite result

`PYTHONPATH=. C:/Python311/python.exe -m pytest -q` against `ai_router/tests/` → **676 passed in 52.78s** (matches the Session 1 baseline; this session is doc + workflow YAML + packaging metadata only, no Python source touched, so a regression here would be surprising).

## Workflow ordering note

Workflow Step 6 (verification) is mode-aware; this set runs outsource-first and the verification routes synchronously through this script. The standing operator constraint restricts `ai_router` usage to end-of-session verification only — this is the only routed call this session.

Per the spec's Session 2 'ends with' clause, the v0.1.0 tag push itself is **human-driven** — not automated by this script — and the close-out summary surfaces the handoff explicitly. The release workflow file is committed; whether v0.1.0 is on PyPI when Session 3 starts depends on whether the human has pushed the tag and approved the deployment environment by then.

## Verification ask

Evaluate whether the deliverables together satisfy the spec's Session 2 acceptance criteria. Specifically:

  1. **Workflow correctness.** Does `release.yml` correctly implement OIDC trusted publishing? Are the `permissions: id-token: write` block and the `environment` references wired so a leaked / compromised secret cannot trigger an unauthorized upload? Does the tag-version-check job catch the 'tagged but didn't bump pyproject.toml' mistake before any upload? Are the two publish paths (TestPyPI for `-rc*`, PyPI for `vX.Y.Z`) gated correctly so a release candidate cannot accidentally end up on PyPI proper, and a final tag cannot accidentally end up only on TestPyPI?

  2. **Runbook completeness.** Does `release-process.md` cover everything the human needs for the first release (one-time PyPI/TestPyPI trusted-publisher config, GitHub deployment-environment setup, RC verification, per-release checklist, rollback path including the PyPI 'no re-upload' constraint)? Are the failure modes table entries actionable, or do any of them just describe the symptom?

  3. **README adoption-section collapse meets the spec.** Does the section now read as 'install command + tuning + first session set' (the spec's target shape) rather than the 60-line walkthrough? Does the editable / source-install fallback live below as a clearly-marked alternative for fork-trackers?

  4. **Packaging-tightening doesn't break the public API.** Does the wheel's removal of `ai_router/tests/` impair any production code path? (Tests should be a development-time artifact, not a runtime concern; confirm.) Does `MANIFEST.in` cover the sdist correctly?

  5. **No regressions.** Test count is still 676, build is still clean. Are there any lurking issues you can spot from the deliverables that the test suite or build wouldn't catch?

Return the structured `{verdict, issues}` JSON described in the verification prompt template. Flag any required follow-up for the human's first release tag-push, or for Session 3.