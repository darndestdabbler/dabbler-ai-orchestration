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

4. **Commit `pyproject.toml` + release notes.** If the repo carries a
   `CHANGELOG.md`, include it; if release notes live in a different
   file (or only in the GitHub release body created in step 9 below),
   adjust the `git add` accordingly:

   ```bash
   git add pyproject.toml <release-notes-files>   # e.g. CHANGELOG.md
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
