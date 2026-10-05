# Marketplace release process

The Marketplace serves the extension; the extension bundles the router;
`dabbler release` cuts the one tag (`vsix-v<version>`) that makes a
release. Publishing authenticates today by the **`VSCE_PAT` environment
secret**, the way every publish to date has shipped. Federation was built
and is one revert away: the Entra-connected organization accepted the
service principal (2026-09-03), but the MSA-era publisher refused to seat
it under any identifier — display name, client id, identity GUID — so
before Azure DevOps retires global PATs on **2026-12-01** one of two
recorded paths must land: the publisher member-add retried after real
propagation (support ticket if it never resolves), or a deliberate
new-publisher migration announced to the installed base, since a new
publisher is a new extension identity that existing installs do not
follow. The one-time Entra setup below is DONE and keeps: app
registration, federated credential, and the service principal seated in
the organization all exist and wait only on the publisher.

## One-time setup (the operator, ~15 minutes)

Everything below happens once. Values you choose are marked `<like this>`;
everything else is pasted exactly.

### 1. Create the app registration

1. Portal: **portal.azure.com → Microsoft Entra ID → App registrations →
   New registration**.
2. Name: `dabbler-marketplace-publisher` (any name; this one says what it
   is). Supported account types: **this organizational directory only**.
   No redirect URI. **Register**.
3. From the app's **Overview** page, copy two values:
   - **Application (client) ID** → this becomes the repository variable
     `AZURE_CLIENT_ID`.
   - **Directory (tenant) ID** → this becomes `AZURE_TENANT_ID`.

### 2. Add the federated credential for this repository

1. In the app registration: **Certificates & secrets → Federated
   credentials → Add credential**.
2. Scenario: **GitHub Actions deploying Azure resources**.
3. Fill exactly:
   - Organization: `darndestdabbler`
   - Repository: `dabbler-ai-orchestration`
   - Entity type: **Environment**
   - Environment name: `marketplace`
   - Name: `github-marketplace-environment`
4. **Add**. (The subject this writes is
   `repo:darndestdabbler/dabbler-ai-orchestration:environment:marketplace`,
   which matches the publish job because it runs in the `marketplace`
   deployment environment.)

### 3. Let the app publish for the Marketplace publisher

1. **marketplace.visualstudio.com/manage** → publisher
   **DarndestDabbler** → **Members → Add**.
2. Add the app registration by its display name
   (`dabbler-marketplace-publisher`); role: **Contributor**.
   - If the member search will not resolve the app, add it in Azure DevOps
     instead: the organization that backs the publisher → **Organization
     settings → Users → Add users**, paste the application (client) ID,
     access level **Basic**, then grant the publisher membership above.

### 4. Set the two repository variables

GitHub: **repo → Settings → Secrets and variables → Actions →
Variables → New repository variable** — twice:

| name              | value                                  |
| ----------------- | -------------------------------------- |
| `AZURE_CLIENT_ID` | the application (client) ID from step 1 |
| `AZURE_TENANT_ID` | the directory (tenant) ID from step 1   |

They are identifiers, not secrets; variables are the right shelf.

Done. Nothing expires, nothing rotates, nothing is stored that could leak.

## Per release

1. A session prepares the release (version stamped from `version.json`,
   landed, closed). The session that changes the version never tags it —
   that is the model, not a defect.
2. The operator authorises; the framework types:

       dabbler release --sessions-dir docs/sessions

   It refuses a dirty tree, tags `vsix-v<version>`, and pushes the tag.
3. The tag starts `publish-vscode.yml`: build, the green-test gate, then —
   after the `marketplace` environment's reviewer approval — the Azure
   login exchanges the job's OIDC token for a credential and
   `vsce publish --azure-credential` ships the exact VSIX the tag names.
4. Verify against what is actually served, not the job's status:

       dabbler release --verify-install

   It asks the Marketplace and exits 0 only when the served version is the
   tagged one.

## Release candidates

Tag `vsix-vX.Y.Z-rcN` to exercise the build path end to end. RC tags build
and upload the VSIX artifact and never publish; no approval, no login.

## Open VSX

Removed, not skipped: nothing was ever published there, and a never-used
job holding the one remaining stored secret was the wrong trade. The job
lives in git history (`publish-openvsx`); restore it the day a
Cursor/VSCodium audience exists, ideally when Open VSX grows federation.
