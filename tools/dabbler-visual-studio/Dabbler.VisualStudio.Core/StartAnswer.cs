using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>What `dabbler session start --json` answers: whether it registered, its refusal, and each way on it offers.</summary>
    public sealed class StartAnswer
    {
        [JsonProperty("registered")]
        public bool Registered { get; private set; }

        /// <summary>The router's words for why it did not start; null where it started, or refused before it could say.</summary>
        [JsonProperty("refusal")]
        public string? Refusal { get; private set; }

        /// <summary>At session 1 the uncommitted files are most likely what the project began from.</summary>
        [JsonProperty("starting_point")]
        public bool StartingPoint { get; private set; }

        [JsonProperty("ways_on")]
        public IReadOnlyList<StartWayOn> WaysOn { get; private set; } = Array.Empty<StartWayOn>();

        /// <summary>One button per way on, in the router's order, titled as VS Code titles it.</summary>
        public IReadOnlyList<StartButton> Buttons =>
            WaysOn.Select(on => new StartButton(TitleOf(on.Way), on.Args)).ToList();

        /// <summary>
        /// The one JSON object the start printed; a <see cref="FormatException"/>
        /// where the text is not one.
        /// </summary>
        public static StartAnswer Parse(string json)
        {
            try
            {
                return JsonConvert.DeserializeObject<StartAnswer>(json.Trim())
                    ?? throw new FormatException("The router printed no answer to the start.");
            }
            catch (JsonException error)
            {
                throw new FormatException($"The router printed something that is not a start's answer: {error.Message}", error);
            }
        }

        private string TitleOf(string way)
        {
            switch (way)
            {
                case "commit": return StartingPoint ? "Commit them as the starting point" : "Commit and Push";
                case "undo": return "Undo the Changes";
                case "merge": return "Merge and Start";
                default: return way;
            }
        }
    }

    /// <summary>One way past a refused start: `commit`, `undo` or `merge`, and the `dabbler` arguments that take it.</summary>
    public sealed class StartWayOn
    {
        [JsonProperty("way")]
        public string Way { get; private set; } = "";

        [JsonProperty("args")]
        public IReadOnlyList<string> Args { get; private set; } = Array.Empty<string>();
    }

    /// <summary>A button on a refused start, and the `dabbler` arguments it runs.</summary>
    public sealed class StartButton
    {
        public StartButton(string title, IReadOnlyList<string> args)
        {
            Title = title;
            Args = args;
        }

        public string Title { get; }

        public IReadOnlyList<string> Args { get; }
    }
}
