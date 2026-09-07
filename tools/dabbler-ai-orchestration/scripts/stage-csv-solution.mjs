// Stage the four-module CSV solution the multi-module walk is driven
// against: a .NET application that watches a folder for CSV files, reads
// each one into `Person` objects, and stores them in a SQLite database.
//
// Four modules, exactly the operator's decomposition:
//
//   model         the Person type every other module references
//   deserializer  CSV text -> Person objects
//   persister     Person objects -> a database
//   app           the watcher that wires the three together
//
// Siblings are consumed as PACKAGES, not project references, because that is
// what the modules feature is for: a module's package is a committed
// artifact its siblings restore. So there is deliberately no solution file
// spanning all four -- one would re-couple what the manifest just decoupled.
//
// The corpus is written as files first and built only on --build, because
// the UI walk needs the tree to exist on disk and does not need it compiled.
//
// This script deletes the directory it stages into on --reset, so it is
// restricted by PATH SHAPE to C:/temp: refusing by shape is the only guard
// that holds when nobody is watching a mistyped --root.

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Arguments, and the guard on where this may write
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : fallback;
};

const ROOT = path.resolve(value("--root", "C:/temp/csv-solution"));
const RESET = flag("--reset");
const BUILD = flag("--build");

const normalized = ROOT.replace(/\\/g, "/").toLowerCase();
if (!normalized.startsWith("c:/temp/")) {
  console.error(
    `refused: --root must be under C:/temp (got ${ROOT}). This script wipes ` +
      "the directory it stages into on --reset, so it is restricted to " +
      "scratch space.",
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const written = [];

function write(relative, contents) {
  const full = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  // LF endings everywhere: a corpus that differed by line ending between
  // machines would read as a change to the manifest reader, which compares
  // bytes.
  fs.writeFileSync(full, contents.replace(/\r\n/g, "\n"), "utf8");
  written.push(relative);
}

function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    out: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
}

if (RESET && fs.existsSync(ROOT)) {
  fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 });
}
fs.mkdirSync(ROOT, { recursive: true });

// ---------------------------------------------------------------------------
// Root build files -- what the framework writes when a manifest turns
// multi-module, written here by hand so the corpus is complete on disk.
// ---------------------------------------------------------------------------

write(
  "global.json",
  `{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestFeature"
  }
}
`,
);

write(
  "Directory.Build.props",
  `<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <!-- Source Link reaches the network for commit metadata; a driven
         session must build the same offline as online. -->
    <IncludeSourceRevisionInInformationalVersion>false</IncludeSourceRevisionInInformationalVersion>
  </PropertyGroup>
</Project>
`,
);

write(
  "Directory.Packages.props",
  `<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>

  <!-- Sibling modules, restored from the committed ./packages folder. One
       unconditioned PackageVersion per module: the session that lands a
       change to a module bumps its pin in the same commit as the package. -->
  <ItemGroup Label="Modules">
    <PackageVersion Include="CsvModel" Version="0.1.0" />
    <PackageVersion Include="CsvDeserializer" Version="0.1.0" />
    <PackageVersion Include="CsvPersister" Version="0.1.0" />
  </ItemGroup>

  <ItemGroup Label="Storage">
    <PackageVersion Include="Microsoft.Data.Sqlite" Version="9.0.3" />
  </ItemGroup>

  <ItemGroup Label="Testing">
    <PackageVersion Include="Microsoft.NET.Test.Sdk" Version="18.8.1" />
    <PackageVersion Include="xunit.v3" Version="3.2.2" />
    <PackageVersion Include="xunit.runner.visualstudio" Version="3.1.5" />
  </ItemGroup>
</Project>
`,
);

write(
  "nuget.config",
  `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <!-- The committed sibling packages, by relative path so every clone
         resolves them the same way. -->
    <add key="modules" value="./packages" />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>
`,
);

write(
  ".gitignore",
  `bin/
obj/
.dabbler/
*.db
inbox/
`,
);

write(
  "packages/README.md",
  `# Committed module packages

Each sibling module is consumed from here as a package, never as a project
reference. \`dabbler module pack <slug>\` produces one, and the pin in
\`Directory.Packages.props\` moves in the same commit.

A package here is immutable: two packs of one source tree produce one
version, and a changed tree produces the next.
`,
);

// ---------------------------------------------------------------------------
// The manifest -- the file that makes this a multi-module solution
// ---------------------------------------------------------------------------

// Key names are the SHIPPED ones: codeRoots and dependsOn, not `roots:` or
// `depends_on:` -- the manifest reader refuses an unknown key rather than
// ignoring it.
write(
  "docs/modules.yaml",
  `# The CSV solution, as declared. Four modules, one repository.
#
# 'dependsOn' is the only direction anyone writes; who depends on a module is
# derived, because two directions kept by hand disagree eventually and the
# disagreement is silent.
modules:
  - slug: model
    title: Person model
    kind: shared-types
    codeRoots: ['modules/model']
    package: CsvModel
    contract: package
  - slug: deserializer
    title: CSV deserializer
    kind: library
    codeRoots: ['modules/deserializer']
    dependsOn: ['model']
    package: CsvDeserializer
    contract: designed
  - slug: persister
    title: Person persistence
    kind: library
    codeRoots: ['modules/persister']
    dependsOn: ['model']
    package: CsvPersister
    contract: designed
  - slug: app
    title: CSV watcher application
    kind: application
    codeRoots: ['modules/app']
    dependsOn: ['model', 'deserializer', 'persister']
    package: CsvWatcher
`,
);

write(
  "dabbler.yaml",
  `# What this repository declares about itself.
schema_version: 1

testing:
  suites:
    - name: dotnet
      command: dotnet test --nologo
      expensive: true
      covers:
        - modules/
        - Directory.Packages.props
        - Directory.Build.props
      test_roots:
        - modules/deserializer/tests
        - modules/persister/tests
      test_glob: '*Tests.cs'

modules:
  packages:
    # A produced package over this is refused unless packages/.gitattributes
    # tracks *.nupkg with LFS.
    ceilingBytes: 5242880
`,
);

// ---------------------------------------------------------------------------
// The sessions root -- what the Work Explorer reads
// ---------------------------------------------------------------------------

// The four planned sessions, one per module. All not-started: this is the
// state the operator finds the solution in when they sit down to build it.
//
// An EMPTY sessions[] is an invariant violation, and both trees then render
// a fault instead of rows -- which is why the corpus declares its plan
// rather than starting blank.
const PLANNED = [
  { number: 1, title: "The Person model", module: "model" },
  { number: 2, title: "Reading a CSV file", module: "deserializer" },
  { number: 3, title: "Storing a person", module: "persister" },
  { number: 4, title: "The watcher", module: "app" },
];

write(
  "docs/sessions/sessions.json",
  `${JSON.stringify(
    {
      schemaVersion: 5,
      sessions: PLANNED.map((s) => ({
        number: s.number,
        title: s.title,
        status: "not-started",
        startedAt: null,
        completedAt: null,
        orchestrator: null,
        verificationVerdict: null,
        modules: [s.module],
      })),
    },
    null,
    2,
  )}\n`,
);

// The heading form is load-bearing: a session row's title is healed from
// `### Session N of M: Title`, and clicking a row lands on that heading.
write(
  "docs/sessions/session-plan.md",
  `# Session plan -- the CSV solution

Each session names the one module it works in. A session that must change two
modules says so and gives a reason, and the framework runs both modules'
suites as its run of record.

### Session 1 of 4: The Person model

**Module:** model

1. Declare \`Person\`: the four fields a CSV row carries, and the database
   identity a stored row gains.
2. Pack it, so its siblings have something to restore.
3. Close out.

### Session 2 of 4: Reading a CSV file

**Module:** deserializer

1. Turn CSV text into \`Person\` objects, honouring a quoted cell that
   contains a comma.
2. Refuse a malformed header, a short row and an unparseable date BY NAME
   rather than skipping them -- a row silently dropped is a person silently
   lost.
3. Close out.

### Session 3 of 4: Storing a person

**Module:** persister

1. Store \`Person\` objects in SQLite.
2. Make email the natural key, so re-reading one file does not duplicate
   anyone.
3. Close out.

### Session 4 of 4: The watcher

**Module:** app

1. Watch a folder; when a CSV lands, read it and store its people.
2. Report what was read, what was stored, and what was refused.
3. Close out.
`,
);

// ---------------------------------------------------------------------------
// Module 1 -- the Person model
// ---------------------------------------------------------------------------

write(
  "modules/model/src/CsvModel/CsvModel.csproj",
  `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <PackageId>CsvModel</PackageId>
    <Version>0.1.0</Version>
    <Description>The Person model every other module references.</Description>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
  </PropertyGroup>
</Project>
`,
);

write(
  "modules/model/src/CsvModel/Person.cs",
  `namespace CsvModel;

/// <summary>One person, as a CSV row carries them and a database stores them.</summary>
public sealed class Person
{
    /// <summary>Database identity. Zero until the row has been stored.</summary>
    public int Id { get; set; }

    public string FirstName { get; set; } = string.Empty;

    public string LastName { get; set; } = string.Empty;

    /// <summary>The natural key: storing the same email twice stores one person.</summary>
    public string Email { get; set; } = string.Empty;

    public DateOnly HiredOn { get; set; }

    public override string ToString() => $"{FirstName} {LastName} <{Email}>";
}
`,
);

// ---------------------------------------------------------------------------
// Module 2 -- the deserializer
// ---------------------------------------------------------------------------

write(
  "modules/deserializer/src/CsvDeserializer/CsvDeserializer.csproj",
  `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <PackageId>CsvDeserializer</PackageId>
    <Version>0.1.0</Version>
    <Description>Reads Person rows out of a CSV file.</Description>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
  </PropertyGroup>
  <ItemGroup>
    <!-- The sibling as a package, restored from ./packages. -->
    <PackageReference Include="CsvModel" />
  </ItemGroup>
</Project>
`,
);

write(
  "modules/deserializer/src/CsvDeserializer/CsvFormatException.cs",
  `namespace CsvDeserializer;

/// <summary>A CSV file that cannot be read as Person rows.</summary>
public sealed class CsvFormatException(string message) : Exception(message);
`,
);

write(
  "modules/deserializer/src/CsvDeserializer/PersonCsvReader.cs",
  `using System.Text;
using CsvModel;

namespace CsvDeserializer;

/// <summary>Reads <see cref="Person"/> rows out of a CSV file.</summary>
public sealed class PersonCsvReader
{
    /// <summary>The header this reader accepts, in order.</summary>
    public static readonly string[] Columns = ["FirstName", "LastName", "Email", "HiredOn"];

    /// <summary>
    /// Every data row of <paramref name="path"/>, in file order.
    /// </summary>
    /// <exception cref="CsvFormatException">
    /// The file is empty, its header is not <see cref="Columns"/>, a row has
    /// the wrong number of cells, or a date will not parse. Each is refused by
    /// name: a row silently dropped is a person silently lost.
    /// </exception>
    public IReadOnlyList<Person> Read(string path)
    {
        using var reader = new StreamReader(path);

        var header = reader.ReadLine();
        if (header is null) throw new CsvFormatException("the file is empty");

        var columns = SplitRow(header);
        if (!columns.SequenceEqual(Columns))
        {
            throw new CsvFormatException(
                $"header is [{string.Join(", ", columns)}], expected [{string.Join(", ", Columns)}]");
        }

        var people = new List<Person>();
        var line = 1;
        while (reader.ReadLine() is { } row)
        {
            line++;
            if (row.Trim().Length == 0) continue;

            var cells = SplitRow(row);
            if (cells.Count != Columns.Length)
            {
                throw new CsvFormatException(
                    $"line {line} has {cells.Count} cells, expected {Columns.Length}");
            }
            if (!DateOnly.TryParse(cells[3], out var hiredOn))
            {
                throw new CsvFormatException($"line {line}: '{cells[3]}' is not a date");
            }

            people.Add(new Person
            {
                FirstName = cells[0],
                LastName = cells[1],
                Email = cells[2],
                HiredOn = hiredOn,
            });
        }
        return people;
    }

    /// <summary>One CSV row, honouring quoted cells that contain a comma.</summary>
    private static List<string> SplitRow(string row)
    {
        var cells = new List<string>();
        var cell = new StringBuilder();
        var quoted = false;

        for (var i = 0; i < row.Length; i++)
        {
            var c = row[i];
            if (quoted)
            {
                if (c == '"' && i + 1 < row.Length && row[i + 1] == '"')
                {
                    cell.Append('"');
                    i++;
                }
                else if (c == '"') quoted = false;
                else cell.Append(c);
            }
            else if (c == '"') quoted = true;
            else if (c == ',')
            {
                cells.Add(cell.ToString().Trim());
                cell.Clear();
            }
            else cell.Append(c);
        }
        cells.Add(cell.ToString().Trim());
        return cells;
    }
}
`,
);

write(
  "modules/deserializer/tests/CsvDeserializer.Tests/CsvDeserializer.Tests.csproj",
  `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" />
    <PackageReference Include="xunit.v3" />
    <PackageReference Include="xunit.runner.visualstudio" />
  </ItemGroup>
  <ItemGroup>
    <!-- Inside one module a project reference is the normal thing. -->
    <ProjectReference Include="../../src/CsvDeserializer/CsvDeserializer.csproj" />
  </ItemGroup>
</Project>
`,
);

write(
  "modules/deserializer/tests/CsvDeserializer.Tests/PersonCsvReaderTests.cs",
  `using CsvDeserializer;
using Xunit;

namespace CsvDeserializer.Tests;

public sealed class PersonCsvReaderTests : IDisposable
{
    private readonly string _dir =
        Directory.CreateTempSubdirectory("csv-reader-tests-").FullName;

    private string WriteCsv(string contents)
    {
        var file = Path.Combine(_dir, $"{Guid.NewGuid():N}.csv");
        File.WriteAllText(file, contents);
        return file;
    }

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void reads_every_data_row_in_file_order()
    {
        var file = WriteCsv(
            "FirstName,LastName,Email,HiredOn\\n" +
            "Ada,Lovelace,ada@example.com,1843-01-05\\n" +
            "Grace,Hopper,grace@example.com,1944-07-02\\n");

        var people = new PersonCsvReader().Read(file);

        Assert.Equal(2, people.Count);
        Assert.Equal("Ada", people[0].FirstName);
        Assert.Equal("grace@example.com", people[1].Email);
        Assert.Equal(new DateOnly(1843, 1, 5), people[0].HiredOn);
    }

    [Fact]
    public void keeps_a_comma_inside_a_quoted_cell()
    {
        var file = WriteCsv(
            "FirstName,LastName,Email,HiredOn\\n" +
            "\\"Ada, the first\\",Lovelace,ada@example.com,1843-01-05\\n");

        var people = new PersonCsvReader().Read(file);

        Assert.Equal("Ada, the first", Assert.Single(people).FirstName);
    }

    [Fact]
    public void refuses_a_header_it_does_not_recognise()
    {
        var file = WriteCsv("Name,Email\\nAda,ada@example.com\\n");

        var error = Assert.Throws<CsvFormatException>(() => new PersonCsvReader().Read(file));

        Assert.Contains("expected", error.Message);
    }

    [Fact]
    public void refuses_a_row_with_too_few_cells()
    {
        var file = WriteCsv(
            "FirstName,LastName,Email,HiredOn\\n" +
            "Ada,Lovelace\\n");

        var error = Assert.Throws<CsvFormatException>(() => new PersonCsvReader().Read(file));

        Assert.Contains("line 2", error.Message);
    }

    [Fact]
    public void refuses_a_date_it_cannot_parse()
    {
        var file = WriteCsv(
            "FirstName,LastName,Email,HiredOn\\n" +
            "Ada,Lovelace,ada@example.com,not-a-date\\n");

        var error = Assert.Throws<CsvFormatException>(() => new PersonCsvReader().Read(file));

        Assert.Contains("not-a-date", error.Message);
    }

    [Fact]
    public void refuses_an_empty_file()
    {
        var file = WriteCsv("");

        Assert.Throws<CsvFormatException>(() => new PersonCsvReader().Read(file));
    }
}
`,
);

// ---------------------------------------------------------------------------
// Module 3 -- the persister
// ---------------------------------------------------------------------------

write(
  "modules/persister/src/CsvPersister/CsvPersister.csproj",
  `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <PackageId>CsvPersister</PackageId>
    <Version>0.1.0</Version>
    <Description>Stores Person rows in a SQLite database.</Description>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="CsvModel" />
    <PackageReference Include="Microsoft.Data.Sqlite" />
  </ItemGroup>
</Project>
`,
);

write(
  "modules/persister/src/CsvPersister/PersonRepository.cs",
  `using CsvModel;
using Microsoft.Data.Sqlite;

namespace CsvPersister;

/// <summary>Stores <see cref="Person"/> rows in a SQLite database.</summary>
/// <param name="connectionString">
/// A Microsoft.Data.Sqlite connection string, for example
/// <c>Data Source=people.db</c>.
/// </param>
public sealed class PersonRepository(string connectionString)
{
    /// <summary>Create the table if this is a fresh database.</summary>
    public void EnsureCreated()
    {
        using var db = Open();
        using var create = db.CreateCommand();
        create.CommandText =
            "CREATE TABLE IF NOT EXISTS People (" +
            "  Id        INTEGER PRIMARY KEY AUTOINCREMENT," +
            "  FirstName TEXT NOT NULL," +
            "  LastName  TEXT NOT NULL," +
            "  Email     TEXT NOT NULL UNIQUE," +
            "  HiredOn   TEXT NOT NULL)";
        create.ExecuteNonQuery();
    }

    /// <summary>
    /// Store every person, and answer how many rows were new.
    /// </summary>
    /// <remarks>
    /// Email is the natural key, so re-reading one file does not duplicate
    /// anyone -- which is what makes the watcher safe to point at a folder
    /// that already has files in it.
    /// </remarks>
    public int Save(IEnumerable<Person> people)
    {
        using var db = Open();
        using var transaction = db.BeginTransaction();
        var stored = 0;

        foreach (var person in people)
        {
            using var insert = db.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText =
                "INSERT OR IGNORE INTO People (FirstName, LastName, Email, HiredOn) " +
                "VALUES ($first, $last, $email, $hired)";
            insert.Parameters.AddWithValue("$first", person.FirstName);
            insert.Parameters.AddWithValue("$last", person.LastName);
            insert.Parameters.AddWithValue("$email", person.Email);
            insert.Parameters.AddWithValue("$hired", person.HiredOn.ToString("O"));
            stored += insert.ExecuteNonQuery();
        }

        transaction.Commit();
        return stored;
    }

    /// <summary>How many people are stored.</summary>
    public int Count()
    {
        using var db = Open();
        using var count = db.CreateCommand();
        count.CommandText = "SELECT COUNT(*) FROM People";
        return Convert.ToInt32(count.ExecuteScalar());
    }

    /// <summary>Everyone stored, by surname then forename.</summary>
    public IReadOnlyList<Person> All()
    {
        using var db = Open();
        using var select = db.CreateCommand();
        select.CommandText =
            "SELECT Id, FirstName, LastName, Email, HiredOn FROM People " +
            "ORDER BY LastName, FirstName";

        var people = new List<Person>();
        using var reader = select.ExecuteReader();
        while (reader.Read())
        {
            people.Add(new Person
            {
                Id = reader.GetInt32(0),
                FirstName = reader.GetString(1),
                LastName = reader.GetString(2),
                Email = reader.GetString(3),
                HiredOn = DateOnly.Parse(reader.GetString(4)),
            });
        }
        return people;
    }

    private SqliteConnection Open()
    {
        var db = new SqliteConnection(connectionString);
        db.Open();
        return db;
    }
}
`,
);

write(
  "modules/persister/tests/CsvPersister.Tests/CsvPersister.Tests.csproj",
  `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" />
    <PackageReference Include="xunit.v3" />
    <PackageReference Include="xunit.runner.visualstudio" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="../../src/CsvPersister/CsvPersister.csproj" />
  </ItemGroup>
</Project>
`,
);

write(
  "modules/persister/tests/CsvPersister.Tests/PersonRepositoryTests.cs",
  `using CsvModel;
using CsvPersister;
using Xunit;

namespace CsvPersister.Tests;

public sealed class PersonRepositoryTests : IDisposable
{
    private readonly string _dir =
        Directory.CreateTempSubdirectory("csv-persister-tests-").FullName;

    private PersonRepository Fresh()
    {
        var file = Path.Combine(_dir, $"{Guid.NewGuid():N}.db");
        var repository = new PersonRepository($"Data Source={file}");
        repository.EnsureCreated();
        return repository;
    }

    private static Person Ada() => new()
    {
        FirstName = "Ada",
        LastName = "Lovelace",
        Email = "ada@example.com",
        HiredOn = new DateOnly(1843, 1, 5),
    };

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { Directory.Delete(_dir, recursive: true); } catch { /* held open */ }
    }

    [Fact]
    public void stores_a_person_and_reads_them_back()
    {
        var repository = Fresh();

        Assert.Equal(1, repository.Save([Ada()]));

        var stored = Assert.Single(repository.All());
        Assert.Equal("ada@example.com", stored.Email);
        Assert.Equal(new DateOnly(1843, 1, 5), stored.HiredOn);
        Assert.True(stored.Id > 0);
    }

    [Fact]
    public void storing_the_same_email_twice_stores_one_person()
    {
        var repository = Fresh();

        repository.Save([Ada()]);
        var second = repository.Save([Ada()]);

        Assert.Equal(0, second);
        Assert.Equal(1, repository.Count());
    }

    [Fact]
    public void orders_everyone_by_surname_then_forename()
    {
        var repository = Fresh();
        repository.Save([
            new Person { FirstName = "Grace", LastName = "Hopper", Email = "g@example.com" },
            new Person { FirstName = "Ada", LastName = "Lovelace", Email = "a@example.com" },
            new Person { FirstName = "Alan", LastName = "Hopper", Email = "al@example.com" },
        ]);

        var names = repository.All().Select(p => $"{p.LastName} {p.FirstName}").ToArray();

        Assert.Equal(["Hopper Alan", "Hopper Grace", "Lovelace Ada"], names);
    }

    [Fact]
    public void a_fresh_database_holds_nobody()
    {
        Assert.Equal(0, Fresh().Count());
    }
}
`,
);

// ---------------------------------------------------------------------------
// Module 4 -- the application
// ---------------------------------------------------------------------------

write(
  "modules/app/src/CsvWatcher/CsvWatcher.csproj",
  `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <PackageId>CsvWatcher</PackageId>
    <Version>0.1.0</Version>
    <Description>Watches a folder for CSV files and stores the people in them.</Description>
  </PropertyGroup>
  <ItemGroup>
    <!-- All three siblings as packages: the application composes them and
         owns none of them. -->
    <PackageReference Include="CsvModel" />
    <PackageReference Include="CsvDeserializer" />
    <PackageReference Include="CsvPersister" />
  </ItemGroup>
</Project>
`,
);

write(
  "modules/app/src/CsvWatcher/Program.cs",
  `using CsvDeserializer;
using CsvPersister;

// The watcher: a folder in, a database out.
//
//   CsvWatcher <inbox folder> <database file> [--once]
//
// --once processes what is already there and exits, which is what a test or a
// walkthrough wants; without it the process keeps watching.

var inbox = args.Length > 0 ? args[0] : Path.Combine(Environment.CurrentDirectory, "inbox");
var database = args.Length > 1 ? args[1] : Path.Combine(Environment.CurrentDirectory, "people.db");
var once = args.Contains("--once");

Directory.CreateDirectory(inbox);

var reader = new PersonCsvReader();
var repository = new PersonRepository($"Data Source={database}");
repository.EnsureCreated();

Console.WriteLine($"watching {inbox}");
Console.WriteLine($"storing  {database}");

void Ingest(string file)
{
    // A file can be reported before the writer has closed it. Retrying
    // briefly is the difference between a watcher that works and one that
    // drops the first file every time.
    for (var attempt = 1; attempt <= 5; attempt++)
    {
        try
        {
            var people = reader.Read(file);
            var stored = repository.Save(people);
            Console.WriteLine(
                $"{Path.GetFileName(file)}: read {people.Count}, stored {stored}, " +
                $"total {repository.Count()}");
            return;
        }
        catch (IOException) when (attempt < 5)
        {
            Thread.Sleep(200 * attempt);
        }
        catch (CsvFormatException error)
        {
            // A refused file is reported and left alone, never half-stored.
            Console.WriteLine($"{Path.GetFileName(file)}: refused -- {error.Message}");
            return;
        }
    }
    Console.WriteLine($"{Path.GetFileName(file)}: could not be opened");
}

foreach (var existing in Directory.EnumerateFiles(inbox, "*.csv").OrderBy(f => f))
{
    Ingest(existing);
}

if (once)
{
    Console.WriteLine($"done: {repository.Count()} people stored");
    return 0;
}

using var watcher = new FileSystemWatcher(inbox, "*.csv") { EnableRaisingEvents = true };
watcher.Created += (_, e) => Ingest(e.FullPath);

Console.WriteLine("watching for new files; press Ctrl+C to stop");
Thread.Sleep(Timeout.Infinite);
return 0;
`,
);

// ---------------------------------------------------------------------------
// Fixtures the walkthrough drops into the inbox
// ---------------------------------------------------------------------------

write(
  "fixtures/people-clean.csv",
  `FirstName,LastName,Email,HiredOn
Ada,Lovelace,ada@example.com,1843-01-05
Grace,Hopper,grace@example.com,1944-07-02
Alan,Turing,alan@example.com,1936-05-28
Katherine,Johnson,katherine@example.com,1953-06-01
`,
);

write(
  "fixtures/people-bad-header.csv",
  `Name,Email
Ada Lovelace,ada@example.com
`,
);

write(
  "fixtures/people-bad-date.csv",
  `FirstName,LastName,Email,HiredOn
Ada,Lovelace,ada@example.com,the fifth of January
`,
);

// ---------------------------------------------------------------------------
// A git repository, because every framework verb reads one
// ---------------------------------------------------------------------------

const git = [];
if (!fs.existsSync(path.join(ROOT, ".git"))) {
  git.push(run("git", ["init", "-b", "master"]));
  git.push(run("git", ["config", "user.name", "CSV walkthrough"]));
  git.push(run("git", ["config", "user.email", "walkthrough@example.com"]));
}
git.push(run("git", ["add", "-A"]));
git.push(run("git", ["commit", "-m", "The CSV solution, staged: four modules, one repository"]));

// ---------------------------------------------------------------------------
// Optionally build it: pack the three libraries, then restore the app
// ---------------------------------------------------------------------------

const build = [];
if (BUILD) {
  const packagesDir = path.join(ROOT, "packages");
  fs.mkdirSync(packagesDir, { recursive: true });
  // Order matters: a module can only be packed once everything it references
  // is already a package on disk.
  for (const project of [
    "modules/model/src/CsvModel/CsvModel.csproj",
    "modules/deserializer/src/CsvDeserializer/CsvDeserializer.csproj",
    "modules/persister/src/CsvPersister/CsvPersister.csproj",
  ]) {
    const packed = run("dotnet", ["pack", project, "-c", "Release", "-o", "packages", "--nologo"]);
    build.push({ step: `pack ${path.basename(project)}`, ok: packed.ok, tail: packed.out.slice(-600) });
    if (!packed.ok) break;
  }
  const tests = run("dotnet", ["test", "--nologo"]);
  build.push({ step: "dotnet test", ok: tests.ok, tail: tests.out.slice(-1200) });
}

console.log(
  JSON.stringify(
    {
      root: ROOT,
      files: written.length,
      modules: ["model", "deserializer", "persister", "app"],
      git: git.every((g) => g.ok) ? "committed" : git.filter((g) => !g.ok).map((g) => g.out.slice(0, 200)),
      build: BUILD ? build : "skipped (pass --build)",
    },
    null,
    2,
  ),
);
