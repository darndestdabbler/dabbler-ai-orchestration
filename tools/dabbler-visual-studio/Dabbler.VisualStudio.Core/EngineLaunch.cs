using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// What `dabbler session launch` says to start: one engine CLI, for a
    /// person to talk to, in one repository. How each engine is started is
    /// the router's; this carries it and decides nothing.
    /// </summary>
    public sealed class EngineLaunch
    {
        [JsonProperty("program")]
        public string Program { get; private set; } = "";

        [JsonProperty("args")]
        public IReadOnlyList<string> Args { get; private set; } = Array.Empty<string>();

        [JsonProperty("cwd")]
        public string Cwd { get; private set; } = "";

        /// <summary>Added to the environment the program inherits.</summary>
        [JsonProperty("env")]
        public IReadOnlyDictionary<string, string> Env { get; private set; } = new Dictionary<string, string>();

        [JsonProperty("title")]
        public string Title { get; private set; } = "";

        /// <summary>The sentence a person types at the CLI's prompt, for a CLI whose argv has no place for it; null where the argv carries it.</summary>
        [JsonProperty("typed")]
        public string? Typed { get; private set; }

        /// <summary>The JSON `session launch` printed; a <see cref="FormatException"/> where it is not a launch line.</summary>
        public static EngineLaunch Parse(string json)
        {
            EngineLaunch? launch;
            try
            {
                launch = JsonConvert.DeserializeObject<EngineLaunch>(json.Trim());
            }
            catch (JsonException error)
            {
                throw new FormatException($"The router printed something that is not a launch line: {error.Message}", error);
            }
            if (launch == null || launch.Program.Length == 0 || launch.Cwd.Length == 0)
            {
                throw new FormatException("The router printed something that is not a launch line: it names no program or no folder.");
            }
            return launch;
        }

        /// <summary>
        /// The `dabbler session launch` arguments for a row's Start Session,
        /// Consult with AI or Open a Mechanic: its purpose, the engine and
        /// model, and the sessions root and session the row's own command names.
        /// </summary>
        public static IReadOnlyList<string> Arguments(WorkExplorerAction action, string engine, string? model)
        {
            string purpose;
            switch (action.Id)
            {
                // Continue Session runs the same start as Start Session.
                case ActionIds.StartSession:
                case ActionIds.ContinueSession: purpose = "session"; break;
                case ActionIds.ConsultWithAi: purpose = "consult"; break;
                case ActionIds.OpenMechanic: purpose = "mechanic"; break;
                default: throw new ArgumentException($"{action.Title} opens no engine.", nameof(action));
            }
            var args = new List<string> { "session", "launch", "--for", purpose, "--engine", engine };
            if (!string.IsNullOrWhiteSpace(model)) args.AddRange(new[] { "--model", model!.Trim() });
            var sessionsDir = ValueOf(action.Argv, "--sessions-dir");
            if (sessionsDir != null) args.AddRange(new[] { "--sessions-dir", sessionsDir });
            var session = ValueOf(action.Argv, "--session");
            if (purpose == "consult" && session != null) args.AddRange(new[] { "--session", session });
            return args;
        }

        private static string? ValueOf(IReadOnlyList<string>? argv, string flag)
        {
            if (argv == null) return null;
            var at = argv.ToList().IndexOf(flag);
            return at >= 0 && at + 1 < argv.Count ? argv[at + 1] : null;
        }
    }
}
