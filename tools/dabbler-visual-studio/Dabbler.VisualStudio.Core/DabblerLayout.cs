using System;
using System.Collections.Generic;
using System.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>What one use of the Dabbler Layout command does.</summary>
    public enum LayoutMove
    {
        /// <summary>Record the developer's arrangement, then arrange the Dabbler windows.</summary>
        Apply,

        /// <summary>Put back the arrangement recorded before the layout.</summary>
        GoBack,
    }

    /// <summary>
    /// One use of the command: the move, the window configuration that holds
    /// the developer's arrangement, and the configuration that was active
    /// when it was recorded, which the way back puts that arrangement into.
    /// </summary>
    public sealed class LayoutUse
    {
        public LayoutUse(LayoutMove move, string record, string over)
        {
            Move = move;
            Record = record;
            Over = over;
        }

        public LayoutMove Move { get; }

        public string Record { get; }

        public string Over { get; }
    }

    /// <summary>
    /// Dabbler Layout's one decision. Whether the layout is applied is kept
    /// in Visual Studio, as the window configuration recording the
    /// arrangement before it, so it survives Visual Studio closing; the
    /// record's name carries the configuration that was active then, since
    /// the active configuration takes in every window moved while it is.
    /// </summary>
    public static class DabblerLayout
    {
        private const string Prefix = "Dabbler: before the layout, over ";

        /// <summary>
        /// Apply where <paramref name="configurations"/> holds no record,
        /// recording over <paramref name="active"/>; otherwise go back to the
        /// record, into the configuration it was recorded over.
        /// </summary>
        public static LayoutUse Use(IEnumerable<string> configurations, string active)
        {
            var record = configurations.FirstOrDefault(name => name.StartsWith(Prefix, StringComparison.Ordinal));
            return record == null
                ? new LayoutUse(LayoutMove.Apply, Prefix + active, active)
                : new LayoutUse(LayoutMove.GoBack, record, record.Substring(Prefix.Length));
        }

        /// <summary>
        /// Whether a session's start applies the layout: where Tools >
        /// Options says so (<paramref name="option"/>), and the layout is not
        /// applied already -- a start never takes it back.
        /// </summary>
        public static bool AtStart(bool option, IEnumerable<string> configurations)
        {
            return option && Use(configurations, "").Move == LayoutMove.Apply;
        }
    }
}
