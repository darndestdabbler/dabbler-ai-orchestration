using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// The Configuration section as `dabbler view configuration` prints it
    /// (packages/router/schemas/configuration-view.schema.json). Every rule
    /// that decides a row, its choices and the command each runs is the
    /// router's: these types carry them and decide nothing.
    /// </summary>
    public sealed class ConfigurationDocument
    {
        /// <summary>The one shape this extension reads.</summary>
        public const int ReadableSchemaVersion = 1;

        [JsonProperty("schemaVersion")]
        public int SchemaVersion { get; private set; }

        /// <summary>No repository was named: every row is this machine's default, and every choice writes it.</summary>
        [JsonProperty("machineOnly")]
        public bool MachineOnly { get; private set; }

        /// <summary>The Configuration root; its tooltip carries the model catalog's age.</summary>
        [JsonProperty("configuration")]
        public ConfigurationRow Configuration { get; private set; } = null!;

        /// <summary>
        /// One line the router printed, as a document; a <see cref="FormatException"/>
        /// naming the problem where it is not one, or is in a shape other than
        /// <see cref="ReadableSchemaVersion"/>.
        /// </summary>
        public static ConfigurationDocument Parse(string json)
        {
            ConfigurationDocument? document;
            try
            {
                document = JsonConvert.DeserializeObject<ConfigurationDocument>(json);
            }
            catch (JsonException error)
            {
                throw new FormatException($"The router printed something that is not a configuration document: {error.Message}", error);
            }
            if (document == null || document.Configuration == null)
            {
                throw new FormatException("The router printed something that is not a configuration document: it has no configuration row.");
            }
            if (document.SchemaVersion != ReadableSchemaVersion)
            {
                throw new FormatException($"The router printed a configuration document in shape {document.SchemaVersion}, and this extension reads shape {ReadableSchemaVersion}: update the extension or the router so they match.");
            }
            return document;
        }
    }

    /// <summary>One row of the section, and the rows beneath it.</summary>
    public sealed class ConfigurationRow
    {
        [JsonProperty("id")]
        public string Id { get; private set; } = "";

        [JsonProperty("kind")]
        public string Kind { get; private set; } = "";

        [JsonProperty("label")]
        public string Label { get; private set; } = "";

        /// <summary>The value and the layer that decided it, in the router's words.</summary>
        [JsonProperty("description")]
        public string? Description { get; private set; }

        /// <summary>Plain text, paragraphs separated by a blank line.</summary>
        [JsonProperty("tooltip")]
        public string? Tooltip { get; private set; }

        /// <summary>The value in force, or null where the row holds none or nobody chose.</summary>
        [JsonProperty("value")]
        public string? Value { get; private set; }

        /// <summary>checkout, machine, shipped or default; null where the reading does not say.</summary>
        [JsonProperty("decidedLayer")]
        public string? DecidedLayer { get; private set; }

        [JsonProperty("click")]
        public ConfigurationAction? Click { get; private set; }

        [JsonProperty("actions")]
        public IReadOnlyList<ConfigurationAction> Actions { get; private set; } = Array.Empty<ConfigurationAction>();

        [JsonProperty("children")]
        public IReadOnlyList<ConfigurationRow> Children { get; private set; } = Array.Empty<ConfigurationRow>();
    }

    /// <summary>
    /// One action: the `dabbler` command it runs, or -- for one that sets a
    /// value -- the pick whose choices each name their own.
    /// </summary>
    public sealed class ConfigurationAction
    {
        [JsonProperty("id")]
        public string Id { get; private set; } = "";

        [JsonProperty("title")]
        public string Title { get; private set; } = "";

        /// <summary>The command, beginning `dabbler`; null on an action that carries a pick.</summary>
        [JsonProperty("argv")]
        public IReadOnlyList<string>? Argv { get; private set; }

        [JsonProperty("pick")]
        public ConfigurationPick? Pick { get; private set; }

        [JsonProperty("confirm")]
        public WorkExplorerConfirmation? Confirm { get; private set; }

        /// <summary>Why the action cannot run now, in words a person can act on; null where it can.</summary>
        [JsonProperty("unavailable")]
        public string? Unavailable { get; private set; }
    }

    /// <summary>What may be chosen for a value, as a list a person picks from.</summary>
    public sealed class ConfigurationPick
    {
        [JsonProperty("title")]
        public string Title { get; private set; } = "";

        [JsonProperty("placeholder")]
        public string Placeholder { get; private set; } = "";

        [JsonProperty("choices")]
        public IReadOnlyList<ConfigurationChoice> Choices { get; private set; } = Array.Empty<ConfigurationChoice>();

        /// <summary>What the list does not offer, each with why.</summary>
        [JsonProperty("withheld")]
        public IReadOnlyList<ConfigurationWithheld> Withheld { get; private set; } = Array.Empty<ConfigurationWithheld>();

        /// <summary>Where the reading lists nothing to pick, how a typed model id is set; null where there is a list.</summary>
        [JsonProperty("typed")]
        public ConfigurationTyped? Typed { get; private set; }
    }

    /// <summary>One thing that may be chosen, and the `dabbler configure` command that sets it.</summary>
    public sealed class ConfigurationChoice
    {
        [JsonProperty("label")]
        public string Label { get; private set; } = "";

        [JsonProperty("description")]
        public string? Description { get; private set; }

        [JsonProperty("detail")]
        public string? Detail { get; private set; }

        [JsonProperty("value")]
        public string Value { get; private set; } = "";

        /// <summary>Why this machine cannot reach it today, where it is still offered; null where it can.</summary>
        [JsonProperty("unreachable")]
        public string? Unreachable { get; private set; }

        [JsonProperty("argv")]
        public IReadOnlyList<string> Argv { get; private set; } = Array.Empty<string>();

        [JsonProperty("mineArgv")]
        public IReadOnlyList<string> MineArgv { get; private set; } = Array.Empty<string>();
    }

    /// <summary>Something the list does not offer, and why.</summary>
    public sealed class ConfigurationWithheld
    {
        [JsonProperty("label")]
        public string Label { get; private set; } = "";

        [JsonProperty("reason")]
        public string Reason { get; private set; } = "";
    }

    /// <summary>A model typed rather than picked: the prompt, and the command the typed id is appended to.</summary>
    public sealed class ConfigurationTyped
    {
        [JsonProperty("prompt")]
        public string Prompt { get; private set; } = "";

        [JsonProperty("argv")]
        public IReadOnlyList<string> Argv { get; private set; } = Array.Empty<string>();

        [JsonProperty("mineArgv")]
        public IReadOnlyList<string> MineArgv { get; private set; } = Array.Empty<string>();
    }

    /// <summary>
    /// What this repository's next session is run with, as `dabbler view
    /// configuration` prints it: the values only. Which layer decided each,
    /// and what could be chosen instead, is the Configuration window's.
    /// </summary>
    public sealed class ConfiguredChoice
    {
        private ConfiguredChoice(string? engine, string? authoringModel, string? mechanicModel)
        {
            Engine = engine;
            AuthoringModel = authoringModel;
            MechanicModel = mechanicModel;
        }

        /// <summary>The engine that authors, or null where none is chosen.</summary>
        public string? Engine { get; }

        public string? AuthoringModel { get; }

        public string? MechanicModel { get; }

        /// <summary>Null where an engine and an authoring model are both chosen; otherwise what is not, and where to choose it.</summary>
        public string? Missing
        {
            get
            {
                var unchosen = new List<string>();
                if (Engine == null) unchosen.Add("an engine");
                if (AuthoringModel == null) unchosen.Add("an authoring model");
                if (unchosen.Count == 0) return null;
                return $"No session was started: {string.Join(" and ", unchosen)} {(unchosen.Count == 1 ? "is" : "are")} not chosen for this repository yet. " +
                    "Choose them in the Dabbler Configuration window, or run `dabbler configure --engine <engine> --authoring-model <model>` at the repository's root.";
            }
        }

        /// <summary>
        /// One document `dabbler view configuration` printed; a
        /// <see cref="FormatException"/> where the text is not one.
        /// </summary>
        public static ConfiguredChoice Read(string json)
        {
            var values = new Dictionary<string, string?>();
            Collect(ConfigurationDocument.Parse(json).Configuration, values);
            string? Value(string id) => values.TryGetValue(id, out var value) ? value : null;
            return new ConfiguredChoice(Value("config:vehicle:authoring"), Value("config:role:authoring"), Value("config:role:mechanic"));
        }

        private static void Collect(ConfigurationRow row, Dictionary<string, string?> values)
        {
            values[row.Id] = string.IsNullOrWhiteSpace(row.Value) ? null : row.Value!.Trim();
            foreach (var child in row.Children) Collect(child, values);
        }
    }
}
