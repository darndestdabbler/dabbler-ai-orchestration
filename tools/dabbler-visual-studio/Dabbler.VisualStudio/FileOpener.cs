using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.VisualStudio.TextManager.Interop;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// Opens the file an action names: a transcript page in the browser, and
    /// everything else -- the plan, the logs, the ledger -- in Visual
    /// Studio's own editor, at the action's line.
    /// </summary>
    internal static class FileOpener
    {
        /// <summary>Opens <paramref name="opens"/>; says why in a message box where it cannot.</summary>
        public static void Open(IServiceProvider services, WorkExplorerOpens opens)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            if (!File.Exists(opens.File))
            {
                Say(services, $"{opens.File} does not exist, so there is nothing to open.");
                return;
            }
            if (string.Equals(Path.GetExtension(opens.File), ".html", StringComparison.OrdinalIgnoreCase))
            {
                InBrowser(services, opens);
                return;
            }
            VsShellUtilities.OpenDocument(services, opens.File, Guid.Empty, out _, out _, out _, out IVsTextView view);
            if (view == null || opens.Line == null) return;
            // The action's line is 1-based; the text view's is 0-based.
            var line = Math.Max(0, opens.Line.Value - 1);
            if (ErrorHandler.Succeeded(view.SetCaretPos(line, 0))) view.CenterLines(line, 1);
        }

        /// <summary>Opens <paramref name="file"/> in Visual Studio's own editor, at the top.</summary>
        public static void Open(IServiceProvider services, string file)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            if (!File.Exists(file))
            {
                Say(services, $"{file} does not exist, so there is nothing to open.");
                return;
            }
            VsShellUtilities.OpenDocument(services, file);
        }

        private static void InBrowser(IServiceProvider services, WorkExplorerOpens opens)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var address = new Uri(opens.File).AbsoluteUri;
            if (!string.IsNullOrEmpty(opens.Fragment)) address += "#" + opens.Fragment;
            try
            {
                Process.Start(new ProcessStartInfo(address) { UseShellExecute = true })?.Dispose();
            }
            catch (Win32Exception error)
            {
                Say(services, $"{opens.File} could not be opened in the browser: {error.Message}");
            }
        }

        private static void Say(IServiceProvider services, string text)
        {
            VsShellUtilities.ShowMessageBox(services, text, "Dabbler",
                OLEMSGICON.OLEMSGICON_WARNING, OLEMSGBUTTON.OLEMSGBUTTON_OK, OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }
    }
}
