using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// Rollback to Start of This Session's one question, from the router's
    /// words and its dry run's facts. Where a stop stands, the report is
    /// offered first: once the rollback has moved the run record aside,
    /// nothing can report the stop.
    /// </summary>
    public static class RollbackAsk
    {
        public const string ReportFirst = "Report, Then Roll Back";

        /// <summary>
        /// The question <paramref name="rollback"/> asks, given what its row
        /// offers and what its dry run printed; a <see cref="FormatException"/>
        /// where the dry run printed no facts.
        /// </summary>
        public static RollbackQuestion Ask(WorkExplorerAction rollback, IEnumerable<WorkExplorerAction> rowActions, string dryRun)
        {
            if (rollback.Argv == null || rollback.Confirm == null) throw new ArgumentException($"{rollback.Title} is not a rollback.", nameof(rollback));
            JObject? facts;
            try
            {
                facts = JsonConvert.DeserializeObject<JObject>(dryRun.Trim());
            }
            catch (JsonException error)
            {
                throw new FormatException($"The rollback's dry run printed something that is not its facts: {error.Message}", error);
            }
            var head = facts?.Value<string>("head");
            var detail = facts?.Value<string>("detail");
            if (string.IsNullOrEmpty(head) || detail == null) throw new FormatException("The rollback's dry run printed no HEAD or no detail.");
            var report = rowActions.FirstOrDefault(action => action.Id == ActionIds.ReportStop && action.Argv != null);
            var words = rollback.Confirm;
            var choices = new List<string>();
            if (report != null)
            {
                choices.Add(ReportFirst);
                detail += $" {ReportFirst} writes a report of the stop first, for you to read and send to " +
                    "Dabbler's maintainers if you choose: one provider call, and nothing is sent.";
            }
            choices.Add(words.Accept);
            if (words.Keep != null) choices.Add(words.Keep);
            var arguments = rollback.Argv.Skip(1).Concat(new[] { "--as-of", head! }).ToList();
            return new RollbackQuestion(words.Title, detail!, choices, words.Accept, report, arguments);
        }
    }

    /// <summary>The rollback's confirmation, the choices in the order shown, and what each runs.</summary>
    public sealed class RollbackQuestion
    {
        internal RollbackQuestion(string title, string detail, IReadOnlyList<string> choices, string accept, WorkExplorerAction? report, IReadOnlyList<string> arguments)
        {
            Title = title;
            Detail = detail;
            Choices = choices;
            Accept = accept;
            Report = report;
            Arguments = arguments;
        }

        public string Title { get; }

        public string Detail { get; }

        public IReadOnlyList<string> Choices { get; }

        /// <summary>The choice that rolls back without a report.</summary>
        public string Accept { get; }

        /// <summary>The row's Report this stop, run first on <see cref="RollbackAsk.ReportFirst"/>; null where no stop stands.</summary>
        public WorkExplorerAction? Report { get; }

        /// <summary>The rollback's router arguments, bound to the HEAD the facts were read at.</summary>
        public IReadOnlyList<string> Arguments { get; }
    }
}
