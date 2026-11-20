using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>Where Tools > Options > Dabbler > Engine says an engine opens: this interface's preference, no rule of the router's.</summary>
    public enum EnginePlace
    {
        VisualStudio,
        WindowsTerminal,
    }

    /// <summary>How one engine is opened.</summary>
    public enum EngineRoute
    {
        /// <summary>A tab attached to the engine already running for the session: a session never has two.</summary>
        Attach,

        /// <summary>A new engine in an Engine tab of its own.</summary>
        Pane,

        /// <summary>A new engine in a tab of the Dabbler window of Windows Terminal.</summary>
        WindowsTerminal,
    }

    /// <summary>Which way an engine the extension starts is opened.</summary>
    public static class EngineOpening
    {
        /// <summary>
        /// Attach where <paramref name="running"/> is the session's engine,
        /// whatever <paramref name="place"/> says; otherwise where it says.
        /// </summary>
        public static EngineRoute Route(EnginePlace place, EngineRecord? running)
        {
            if (running != null) return EngineRoute.Attach;
            return place == EnginePlace.VisualStudio ? EngineRoute.Pane : EngineRoute.WindowsTerminal;
        }

        /// <summary>
        /// Where the Engine tab or its host failed before an engine existed:
        /// attach where <paramref name="running"/> shows the session's engine
        /// came to run after all, and otherwise Windows Terminal, whatever the
        /// option says, so the engine still opens.
        /// </summary>
        public static EngineRoute AfterFailure(EngineRecord? running)
        {
            return running != null ? EngineRoute.Attach : EngineRoute.WindowsTerminal;
        }

        /// <summary>
        /// Whether a tab holding the engine of <paramref name="tabSession"/> in
        /// <paramref name="tabFolder"/> is the one closed when session
        /// <paramref name="closedSession"/> of the repository at
        /// <paramref name="root"/> closes: a consult's or a Mechanic's tab,
        /// whose session is null, never is.
        /// </summary>
        public static bool Closes(string? tabFolder, int? tabSession, string root, string? closedSession)
        {
            if (tabFolder == null || tabSession == null || !int.TryParse(closedSession, out var closed) || closed != tabSession) return false;
            return string.Equals(Normal(tabFolder), Normal(root), StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Of the host's <paramref name="records"/>, the engines that end when
        /// session <paramref name="closedSession"/> of the repository at
        /// <paramref name="root"/> closes, whether a tab holds them or not:
        /// as <see cref="Closes"/> says of a tab.
        /// </summary>
        public static IReadOnlyList<EngineRecord> Ends(IEnumerable<EngineRecord> records, string root, string? closedSession)
        {
            return records.Where(record => Closes(record.Folder, record.Session, root, closedSession)).ToList();
        }

        private static string Normal(string folder) => Path.GetFullPath(folder).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        /// <summary>
        /// The running engine of <paramref name="session"/> in the repository
        /// at <paramref name="folder"/>, or null: a consult or a Mechanic,
        /// whose session is null, is never one.
        /// </summary>
        public static EngineRecord? RunningFor(IEnumerable<EngineRecord> records, string folder, int? session)
        {
            if (session == null) return null;
            return records.FirstOrDefault(record => record.Session == session && record.IsFor(folder));
        }
    }
}
