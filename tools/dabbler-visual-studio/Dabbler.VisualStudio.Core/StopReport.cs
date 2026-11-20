using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// Report this stop to Dabbler: the command that writes the report, and
    /// the file the router said it wrote. The report is the developer's to
    /// read and send; nothing here sends it.
    /// </summary>
    public static class StopReport
    {
        /// <summary>
        /// The router arguments that write the report <paramref name="action"/>
        /// stands for (its argv without the leading `dabbler`), answering as
        /// JSON, and saying a rollback follows where <paramref name="rollingBack"/>.
        /// </summary>
        public static IReadOnlyList<string> Arguments(WorkExplorerAction action, bool rollingBack)
        {
            if (action.Argv == null) throw new ArgumentException($"{action.Title} runs no command.", nameof(action));
            var args = action.Argv.Skip(1).ToList();
            args.Add("--json");
            if (rollingBack) args.Add("--rolling-back");
            return args;
        }

        /// <summary>
        /// The report the router printed it wrote, under <paramref name="repositoryRoot"/>;
        /// a <see cref="FormatException"/> where what it printed names no file.
        /// </summary>
        public static WrittenReport Written(string repositoryRoot, string json)
        {
            JObject? said;
            try
            {
                said = JsonConvert.DeserializeObject<JObject>(json.Trim());
            }
            catch (JsonException error)
            {
                throw new FormatException($"The router printed something that is not a written report: {error.Message}", error);
            }
            var file = said?.Value<string>("file");
            if (string.IsNullOrEmpty(file)) throw new FormatException("The router printed no report file.");
            return new WrittenReport(Path.GetFullPath(Path.Combine(repositoryRoot, file)), said!.Value<string>("reports_to"));
        }
    }

    /// <summary>A report on disk, and the address its manifest says reports go to, if it names one.</summary>
    public sealed class WrittenReport
    {
        public WrittenReport(string file, string? reportsTo)
        {
            File = file;
            ReportsTo = string.IsNullOrEmpty(reportsTo) ? null : reportsTo;
        }

        public string File { get; }

        public string? ReportsTo { get; }
    }
}
