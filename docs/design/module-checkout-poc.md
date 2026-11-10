# Module-checkout POC: a focused clone builds one module with no sibling source on disk

**Built and run 2026-09-06**, after consult round 8
(`consults/round8-synthesis.md`), on the operator's suggestion of a
thirty-minute proof. Plain `git` 2.51 and the .NET 10 SDK, no framework
code. The repository, the origin, the script and its log live under
`C:\temp\modules-poc\` on the operator's machine; the script is
reproduced at the end so the proof can be re-run anywhere.

## What it proves

1. **A sparse, blob-filtered clone holds only the module.** Eleven files
   on disk for the persister: its source and tests, the four root build
   files, the model's `contract/` page, and the model's committed
   package. The model's source directories are absent, not hidden, and
   the two blobs behind them are **not in the local object store**
   (`git rev-list --objects --missing=print` lists them as missing).
2. **The module compiles and its tests pass against the committed
   package.** `dotnet restore`, `build` and `test` took 6 seconds; two
   tests passed; NuGet's own `.nupkg.metadata` for `CsvModel` records
   `"source": "…\\persister-session\\packages"` — the package came from
   the clone's tracked folder, by the relative path in `nuget.config`.
   The persister's project says `<PackageReference Include="CsvModel" />`
   and never `ProjectReference`; the version is pinned once in
   `Directory.Packages.props`.
3. **The grant is one command and instant.** `git sparse-checkout add
   modules/model/src` fetched the two blobs and put the model's source on
   disk in under a second. `git sparse-checkout set …` narrowed it away
   again.
4. **Why the session clone is disposable.** After the revoke the model's
   source is gone from disk but its blobs stay in this clone's object
   store (missing: 2 before the grant, 0 after, 0 after the revoke). A
   grant is a one-way widening of what the machine holds; the wall is
   restored by discarding the session clone, not by narrowing it.

Clone plus sparse checkout: 2 s. Whole run, including creating the
monorepo, packing the model and making the origin: 16 s.

## What it does not prove

- Nothing here is the framework: `dabbler module open`, the grant as an
  owed decision, the exposure manifest, the impact plan and the selected
  run of record are all still to build (round 8's sessions 2–8).
- The contract page is hand-written; generation from the built assembly
  and the abstractions / contract-test packages are round 8's session 3.
- The origin is a local bare repository with `uploadpack.allowFilter`
  set; GitHub and Azure DevOps support partial clone, but the Windows
  preflight round 8 owes (antivirus, restore, many clones) was not run.
- Java was not exercised; the Maven shape is the same by construction
  (a file-based repository in the tree, `-pl :module` without `-am`).

## The run, verbatim (line-ending warnings removed)

```
### 1. the monorepo: two modules, the model packed into ./packages
  Successfully created package 'C:\temp\modules-poc\repo\packages\CsvModel.0.1.0-dev.1.nupkg'.
tracked files:
  .gitignore
  Directory.Build.props
  Directory.Packages.props
  global.json
  modules/model/contract/CsvModel.api.md
  modules/model/src/CsvModel/CsvModel.csproj
  modules/model/src/CsvModel/Person.cs
  modules/persister/src/CsvPersister/CsvPersister.csproj
  modules/persister/src/CsvPersister/InMemoryPersister.cs
  modules/persister/tests/CsvPersister.Tests/CsvPersister.Tests.csproj
  modules/persister/tests/CsvPersister.Tests/InMemoryPersisterTests.cs
  nuget.config
  packages/CsvModel.0.1.0-dev.1.nupkg

### 2. an origin that allows partial clones (any host does; a bare repo here)

### 3. the focused checkout: blob-filtered, sparse, persister only
clone + sparse checkout: 2 s
files on disk:
  ./.gitignore
  ./Directory.Build.props
  ./Directory.Packages.props
  ./global.json
  ./modules/model/contract/CsvModel.api.md
  ./modules/persister/src/CsvPersister/CsvPersister.csproj
  ./modules/persister/src/CsvPersister/InMemoryPersister.cs
  ./modules/persister/tests/CsvPersister.Tests/CsvPersister.Tests.csproj
  ./modules/persister/tests/CsvPersister.Tests/InMemoryPersisterTests.cs
  ./nuget.config
  ./packages/CsvModel.0.1.0-dev.1.nupkg
model source on disk: NO (absent, not hidden)
tracked in git, all the same:
  modules/model/src/CsvModel/CsvModel.csproj
  modules/model/src/CsvModel/Person.cs
Person.cs blob daaea9e27215c429ef5bd7bdcff2084ad40324f1: NOT in the local object store (2 blobs missing locally)

### 4. restore, build, test the persister -- against the committed CsvModel package
  Restored C:\temp\modules-poc\persister-session\modules\persister\tests\CsvPersister.Tests\CsvPersister.Tests.csproj (in 539 ms).
  CsvPersister -> C:\temp\modules-poc\persister-session\modules\persister\src\CsvPersister\bin\Debug\net10.0\CsvPersister.dll
  CsvPersister.Tests -> C:\temp\modules-poc\persister-session\modules\persister\tests\CsvPersister.Tests\bin\Debug\net10.0\CsvPersister.Tests.dll
Build succeeded.
Passed!  - Failed:     0, Passed:     2, Skipped:     0, Total:     2, Duration: 523 ms - CsvPersister.Tests.dll (net10.0)
restore + build + test: 6 s
where restore got CsvModel from:
  {
    "version": 2,
    "contentHash": "VrMCULTln3U3dough2cytzQASVg+2rboEmQA6Jo/kEzQSBQJTlTr1iXgLSzLkVEK9yzrA6H24mL64YMbZ27LJg==",
    "source": "C:\\temp\\modules-poc\\persister-session\\packages"
  }
### 5. the grant: widen the cone to the model's source (the blob is fetched now)
grant (widen): 0 s
  CsvModel.csproj
  Person.cs
blobs missing locally: before grant 2, after grant 0

### 6. the revoke: narrow again
model source on disk: absent again
blobs missing locally after revoke: 0 (the fetched blobs stay in this clone's store -- why a session clone is disposable)

### total wall clock: 16 s
```

## The files that make it work

`nuget.config` (tracked, relative path):

```xml
<packageSources>
  <add key="modules" value="packages" />
  <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
</packageSources>
```

`Directory.Packages.props` (tracked, one pin per sibling):

```xml
<ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
<PackageVersion Include="CsvModel" Version="0.1.0-dev.1" />
```

The consumer's project, across the seam:

```xml
<PackageReference Include="CsvModel" />
```

## The script

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /c/temp/modules-poc
# 1. the monorepo, with the model packed into ./packages and committed
cd repo && git init -q -b main && git add -A
git commit -q -m "Monorepo: model and persister modules; siblings referenced as packages"
dotnet pack modules/model/src/CsvModel -c Release -o packages --nologo
git add packages && git commit -q -m "CsvModel 0.1.0-dev.1: the model's package, committed beside its source"
cd ..
# 2. an origin that allows partial clones
git clone -q --bare repo origin.git
git -C origin.git config uploadpack.allowFilter true
git -C origin.git config uploadpack.allowAnySHA1InWant true
# 3. the focused checkout
git clone -q --filter=blob:none --no-checkout --sparse "file:///C:/temp/modules-poc/origin.git" persister-session
cd persister-session
git sparse-checkout set modules/persister modules/model/contract packages
git checkout -q main
git rev-list --objects --missing=print HEAD | grep '^?'      # the model's blobs, absent
# 4. build and test against the committed package
dotnet restore modules/persister/tests/CsvPersister.Tests
dotnet build   modules/persister/tests/CsvPersister.Tests --no-restore
dotnet test    modules/persister/tests/CsvPersister.Tests --no-build
cat "$USERPROFILE/.nuget/packages/csvmodel/0.1.0-dev.1/.nupkg.metadata"   # "source": ...\packages
# 5. grant, 6. revoke
git sparse-checkout add modules/model/src
git sparse-checkout set modules/persister modules/model/contract packages
```
