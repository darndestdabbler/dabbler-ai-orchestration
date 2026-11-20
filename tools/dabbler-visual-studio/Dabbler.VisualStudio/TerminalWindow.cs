using System;
using System.Collections.Concurrent;
using System.ComponentModel.Design;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Threading;
using SolutionEvents = Microsoft.VisualStudio.Shell.Events.SolutionEvents;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// The Dabbler Terminal: the lines `dabbler terminal --follow --json`
    /// prints for the git repository holding the open solution, a row to a
    /// line, as the VS Code extension's terminal shows them.
    /// </summary>
    // A profile places a window once, where its registration says, and
    // keeps it there; this identity is the one registered on the right.
    [Guid("5f0b8e3c-2a71-4d96-b4e8-7c13d9a62f05")]
    public sealed class TerminalWindow : ToolWindowPane
    {
        private readonly TerminalRows rows = new TerminalRows();

        // What the router printed and the main thread has not added yet, each
        // with the following it belongs to.
        private readonly ConcurrentQueue<(int Generation, string Line)> pending = new ConcurrentQueue<(int Generation, string Line)>();

        // 1 while a drain is scheduled or running.
        private int draining;

        private RouterFollow? follow;

        // Which following is current. A line or a restart that belongs to an
        // earlier one is dropped; read and written on the main thread only.
        private int generation;

        private readonly TerminalControl control;

        public TerminalWindow()
            : base(null)
        {
            Caption = "Dabbler Terminal";
            control = new TerminalControl { DataContext = rows };
            Content = control;
        }

        private DabblerPackage Dabbler => (DabblerPackage)Package;

        public override void OnToolWindowCreated()
        {
            base.OnToolWindowCreated();
            // Visual Studio turns Ctrl+C into its Edit.Copy command before the
            // list sees the key, and sends it to the active window's pane.
            if (GetService(typeof(IMenuCommandService)) is OleMenuCommandService commands)
            {
                var copy = new OleMenuCommand(
                    (_, _) => control.CopySelection(),
                    new CommandID(VSConstants.GUID_VSStandardCommandSet97, (int)VSConstants.VSStd97CmdID.Copy));
                copy.BeforeQueryStatus += (_, _) => copy.Enabled = control.CanCopy;
                commands.AddCommand(copy);
            }
            SolutionEvents.OnAfterOpenSolution += OnSolutionChanged;
            SolutionEvents.OnAfterCloseSolution += OnSolutionChanged;
            Restart();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                SolutionEvents.OnAfterOpenSolution -= OnSolutionChanged;
                SolutionEvents.OnAfterCloseSolution -= OnSolutionChanged;
                generation++;
                Stop();
            }
            base.Dispose(disposing);
        }

        private void OnSolutionChanged(object sender, EventArgs e)
        {
            Restart();
        }

        private void Restart()
        {
            Dabbler.JoinableTaskFactory.RunAsync(RestartAsync).FileAndForget("dabbler/terminal/follow");
        }

        /// <summary>Stops what is followed, and follows the open solution's repository, where there is one.</summary>
        private async Task RestartAsync()
        {
            await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
            var mine = ++generation;
            Stop();
            rows.Clear();
            var folder = await Dabbler.SolutionFolderAsync();
            if (mine != generation || folder == null) return;
            var root = WorkExplorerTree.RepositoryRootOf(folder);
            if (root == null) return;
            if (!await Dabbler.EnsureNodeAsync() || mine != generation) return;
            var router = Dabbler.Router;
            if (router == null) return;
            follow = new RouterFollow(
                router,
                root,
                new[] { "terminal", "--follow", "--json" },
                line => OnLine(mine, line),
                Dabbler.Commands);
        }

        /// <summary>
        /// One line the router printed, read off the main thread. Lines are
        /// queued and added on the main thread in the order they came, however
        /// many arrive before it gets to them.
        /// </summary>
        private void OnLine(int mine, string line)
        {
            pending.Enqueue((mine, line));
            if (Interlocked.Exchange(ref draining, 1) == 1) return;
            Dabbler.JoinableTaskFactory.RunAsync(DrainAsync).FileAndForget("dabbler/terminal/show");
        }

        /// <summary>
        /// Adds every queued line that belongs to the current following. A
        /// line that is not a terminal object is said in the Dabbler Commands
        /// pane, and the rows stay as they were.
        /// </summary>
        private async Task DrainAsync()
        {
            await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
            while (true)
            {
                while (pending.TryDequeue(out var queued))
                {
                    if (queued.Generation != generation) continue;
                    try
                    {
                        rows.Add(queued.Line);
                    }
                    catch (FormatException error)
                    {
                        Dabbler.Commands?.Wrote(error.Message);
                    }
                }
                Volatile.Write(ref draining, 0);
                // A line queued after the queue read empty and before the flag
                // was cleared would otherwise wait for the next one.
                if (pending.IsEmpty || Interlocked.Exchange(ref draining, 1) == 1) return;
            }
        }

        private void Stop()
        {
            follow?.Dispose();
            follow = null;
        }
    }
}
