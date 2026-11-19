using System;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// The "Dabbler Session" pane of the Output window: what a session verb
    /// printed in full, such as a close's gate rows, which say which gate
    /// refused and what to do and are too many for a dialog.
    /// </summary>
    internal sealed class SessionPane
    {
        public const string Title = "Dabbler Session";

        private static readonly Guid PaneGuid = new Guid("3f0c1e52-7a4d-4b8e-9c61-2d5b8a0e4f17");

        private readonly IVsOutputWindowPane pane;

        private SessionPane(IVsOutputWindowPane pane)
        {
            this.pane = pane;
        }

        /// <summary>The pane, created on the main thread.</summary>
        public static SessionPane Create(IVsOutputWindow window)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var guid = PaneGuid;
            window.CreatePane(ref guid, Title, 1, 0);
            window.GetPane(ref guid, out var pane);
            return new SessionPane(pane);
        }

        /// <summary>Replaces what the pane shows with <paramref name="text"/>, headed by the verb that printed it, and brings it forward.</summary>
        public void Show(string verb, string text)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            pane.Clear();
            pane.OutputStringThreadSafe($"[{DateTime.Now.ToLongTimeString()}] {verb}{Environment.NewLine}");
            pane.OutputStringThreadSafe(text.TrimEnd() + Environment.NewLine);
            pane.Activate();
        }
    }
}
