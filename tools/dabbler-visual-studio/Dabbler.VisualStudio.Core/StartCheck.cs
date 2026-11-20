using System.Collections.Generic;
using System.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// What Start Session asks before a session and Visual Studio write the
    /// same checkout: unsaved documents the engine may also edit, a debugger
    /// holding the build's output, a build running against the folders the
    /// session's own build needs. It asks; it stops and closes nothing.
    /// </summary>
    public static class StartCheck
    {
        public const string SaveAllAndGoOn = "Save All and Go On";

        public const string GoOnAnyway = "Go On Anyway";

        public const string NotNow = "Not Now";

        /// <summary>
        /// The question for what Visual Studio is doing, or null where it has
        /// no unsaved document, no debugger running and no build in progress.
        /// </summary>
        public static StartQuestion? Ask(IReadOnlyList<string> unsavedDocuments, bool debugging, bool building)
        {
            var found = new List<string>();
            if (unsavedDocuments.Count == 1)
            {
                found.Add($"{unsavedDocuments[0]} has unsaved changes. The engine reads the file as it is on disk, and an edit it makes there meets yours when you save.");
            }
            else if (unsavedDocuments.Count > 1)
            {
                var names = string.Join(", ", unsavedDocuments.Take(5)) + (unsavedDocuments.Count > 5 ? $" and {unsavedDocuments.Count - 5} more" : "");
                found.Add($"{unsavedDocuments.Count} documents have unsaved changes: {names}. The engine reads each as it is on disk, and an edit it makes there meets yours when you save.");
            }
            if (debugging)
            {
                found.Add("The debugger is running. What it runs holds files under bin, so the session's own build can fail to write them.");
            }
            if (building)
            {
                found.Add("A build is in progress. It writes the folders the session's own build and tests need.");
            }
            if (found.Count == 0) return null;
            var choices = new List<string>();
            if (unsavedDocuments.Count > 0) choices.Add(SaveAllAndGoOn);
            choices.Add(GoOnAnyway);
            choices.Add(NotNow);
            var detail = string.Join("\n\n", found) + "\n\nNothing is stopped or closed for you.";
            return new StartQuestion("Visual Studio is working in this checkout", detail, choices, choices[0]);
        }
    }

    /// <summary>The question before a start: what was found, and the choices in the order shown.</summary>
    public sealed class StartQuestion
    {
        internal StartQuestion(string title, string detail, IReadOnlyList<string> choices, string defaultChoice)
        {
            Title = title;
            Detail = detail;
            Choices = choices;
            DefaultChoice = defaultChoice;
        }

        public string Title { get; }

        /// <summary>Each thing found, a paragraph each.</summary>
        public string Detail { get; }

        public IReadOnlyList<string> Choices { get; }

        public string DefaultChoice { get; }
    }
}
