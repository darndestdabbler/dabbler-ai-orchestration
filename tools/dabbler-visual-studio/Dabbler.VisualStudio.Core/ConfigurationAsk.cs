using System;
using System.Collections.Generic;
using System.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>One line of a picker: a choice the router offers, or one it withholds.</summary>
    public sealed class PickItem
    {
        internal PickItem(string label, string? value, string? description, string? detail, string? reason, IReadOnlyList<string>? arguments)
        {
            Label = label;
            Value = value;
            Description = description;
            Detail = detail;
            Reason = reason;
            Arguments = arguments;
        }

        public string Label { get; }

        /// <summary>The value choosing it sets, such as an engine or a model id; null on a withheld entry.</summary>
        public string? Value { get; }

        public string? Description { get; }

        public string? Detail { get; }

        /// <summary>
        /// Why this machine cannot reach it, on a choice still offered; why
        /// it is not offered, on a withheld one; null on a choice it can reach.
        /// </summary>
        public string? Reason { get; }

        /// <summary>The router arguments choosing it runs (argv without `dabbler`); null where it cannot be chosen.</summary>
        public IReadOnlyList<string>? Arguments { get; }

        public bool Choosable => Arguments != null;
    }

    /// <summary>
    /// What a Configuration action asks a person, read from the router's own
    /// description of it. The choices, their words and their commands are
    /// the router's; this decides only which command runs.
    /// </summary>
    public static class ConfigurationAsk
    {
        /// <summary>Update the Catalog: the root row's action, which runs `dabbler discovery refresh`.</summary>
        public const string RefreshRecord = "dabblerSolution.refreshRecord";

        /// <summary>Store a Key on This Machine: `dabbler auth set`, which asks for the key in its own terminal.</summary>
        public const string StoreCredential = "dabblerSolution.storeCredential";

        /// <summary>
        /// The arguments Update the Catalog runs without its confirmation,
        /// where <paramref name="document"/> says a transport this machine
        /// reaches has never been read -- reading it is free and sends no
        /// prompt, and every model choice on it fails until it is; null where
        /// none is unread or the root offers no refresh it can run.
        /// </summary>
        public static IReadOnlyList<string>? UnreadRefresh(ConfigurationDocument document)
        {
            if (document.Unread.Count == 0) return null;
            var refresh = document.Configuration.Actions.FirstOrDefault(action => action.Id == RefreshRecord);
            return refresh == null ? null : Arguments(refresh, _ => true);
        }

        /// <summary>
        /// The picker's list: each choice in the router's order, an
        /// unreachable one marked with its reason and still choosable, then
        /// each withheld entry with its reason, which cannot be chosen.
        /// </summary>
        public static IReadOnlyList<PickItem> Items(ConfigurationPick pick)
        {
            var offered = pick.Choices.Select(choice => new PickItem(choice.Label, choice.Value, choice.Description, choice.Detail, choice.Unreachable, WithoutProgram(choice.Argv)));
            var withheld = pick.Withheld.Select(entry => new PickItem(entry.Label, null, null, null, entry.Reason, null));
            return offered.Concat(withheld).ToList();
        }

        /// <summary>
        /// The arguments a typed model id runs: the pick's typed command with
        /// the trimmed id appended; null where the pick takes no typed id or
        /// <paramref name="id"/> is blank or dismissed.
        /// </summary>
        public static IReadOnlyList<string>? Typed(ConfigurationPick pick, string? id)
        {
            var text = (id ?? "").Trim();
            if (pick.Typed == null || text.Length == 0) return null;
            var args = WithoutProgram(pick.Typed.Argv).ToList();
            args.Add(text);
            return args;
        }

        /// <summary>
        /// The router arguments an action with its own command runs (its argv
        /// without `dabbler`), or null where it runs nothing: it has no
        /// command, it is unavailable, or its confirmation was not accepted.
        /// <paramref name="confirm"/> is true only for the confirmation's accept.
        /// </summary>
        public static IReadOnlyList<string>? Arguments(ConfigurationAction action, Func<WorkExplorerConfirmation, bool> confirm)
        {
            if (action.Argv == null || action.Unavailable != null) return null;
            if (action.Confirm != null && !confirm(action.Confirm)) return null;
            return WithoutProgram(action.Argv);
        }

        private static IReadOnlyList<string> WithoutProgram(IReadOnlyList<string> argv)
        {
            return argv.Skip(1).ToList();
        }
    }
}
