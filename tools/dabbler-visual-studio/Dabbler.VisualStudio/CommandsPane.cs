using System;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// The "Dabbler Commands" pane of the Output window: every command the
    /// extension runs, in the VS Code extension's form. The command has a line
    /// of its own with nothing else on it, so a developer can copy it and run
    /// it; the time goes on the line above.
    /// </summary>
    internal sealed class CommandsPane : IRouterEcho
    {
        public const string Title = "Dabbler Commands";

        private static readonly Guid PaneGuid = new Guid("fab1996b-d9bf-4634-aa1c-9628fe412d70");

        private readonly IVsOutputWindowPane pane;

        private CommandsPane(IVsOutputWindowPane pane)
        {
            this.pane = pane;
        }

        /// <summary>The pane, created on the main thread the first time it is asked for.</summary>
        public static CommandsPane Create(IVsOutputWindow window)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var guid = PaneGuid;
            window.CreatePane(ref guid, Title, 1, 0);
            window.GetPane(ref guid, out var pane);
            return new CommandsPane(pane);
        }

        // The router runs off the main thread, so the echo does too, and
        // OutputStringThreadSafe is the pane's one member safe from any thread;
        // VSTHRD010 cannot tell it from the others.
#pragma warning disable VSTHRD010
        public void Running(string commandLine)
        {
            pane.OutputStringThreadSafe($"[{DateTime.Now.ToLongTimeString()}] Running:{Environment.NewLine}");
            pane.OutputStringThreadSafe(commandLine + Environment.NewLine);
        }

        public void Wrote(string output)
        {
            foreach (var line in output.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None))
            {
                if (line.Trim().Length > 0) pane.OutputStringThreadSafe($"  {line}{Environment.NewLine}");
            }
        }
#pragma warning restore VSTHRD010
    }
}
