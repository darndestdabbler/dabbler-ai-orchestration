using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Dabbler.VisualStudio.Core
{
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
            JToken? root;
            try
            {
                root = JToken.Parse(json) is JObject document ? document["configuration"] : null;
            }
            catch (JsonException error)
            {
                throw new FormatException($"The router printed something that is not a configuration document: {error.Message}", error);
            }
            if (!(root is JObject))
            {
                throw new FormatException("The router printed something that is not a configuration document: it has no configuration row.");
            }
            var values = new Dictionary<string, string?>();
            Collect(root, values);
            string? Value(string id) => values.TryGetValue(id, out var value) ? value : null;
            return new ConfiguredChoice(Value("config:vehicle:authoring"), Value("config:role:authoring"), Value("config:role:mechanic"));
        }

        private static void Collect(JToken row, Dictionary<string, string?> values)
        {
            if (row["id"]?.Type == JTokenType.String)
            {
                var value = row["value"];
                var text = value?.Type == JTokenType.String ? value.Value<string>() : null;
                values[row["id"]!.Value<string>()!] = string.IsNullOrWhiteSpace(text) ? null : text!.Trim();
            }
            if (row["children"] is JArray children)
            {
                foreach (var child in children) Collect(child, values);
            }
        }
    }
}
