using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Imaging;
using Microsoft.VisualStudio.Imaging.Interop;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.VisualStudio.Threading;
using SolutionEvents = Microsoft.VisualStudio.Shell.Events.SolutionEvents;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// Says, across the top of Visual Studio's main window, when a session
    /// needs a person: paused, an instruction overdue, or closed. It follows
    /// the open solution's repository, and keeps following one whose session
    /// is still open after the developer moves to another solution, so its
    /// close still reaches them.
    /// </summary>
    internal sealed class NoticeWatcher : IDisposable
    {
        private static readonly string RaisedFile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dabbler", "visual-studio-notices.txt");

        private readonly DabblerPackage package;

        // Each repository followed, by its root; main thread only.
        private readonly Dictionary<string, Watched> watched = new Dictionary<string, Watched>(StringComparer.OrdinalIgnoreCase);

        // The open solution's repository; main thread only.
        private string? openRoot;

        public NoticeWatcher(DabblerPackage package)
        {
            this.package = package;
            SolutionEvents.OnAfterOpenSolution += OnSolutionChanged;
            SolutionEvents.OnAfterCloseSolution += OnSolutionChanged;
            Refresh();
        }

        public void Dispose()
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            SolutionEvents.OnAfterOpenSolution -= OnSolutionChanged;
            SolutionEvents.OnAfterCloseSolution -= OnSolutionChanged;
            foreach (var entry in watched.Values) entry.Dispose();
            watched.Clear();
        }

        private void OnSolutionChanged(object sender, EventArgs e)
        {
            Refresh();
        }

        private void Refresh()
        {
            package.JoinableTaskFactory.RunAsync(RefreshAsync).FileAndForget("dabbler/notices/follow");
        }

        /// <summary>Follows the open solution's repository, where it is not followed already, and drops what no longer needs following.</summary>
        private async Task RefreshAsync()
        {
            var folder = await package.SolutionFolderAsync();
            openRoot = folder == null ? null : WorkExplorerTree.RepositoryRootOf(folder);
            Prune();
            var root = openRoot;
            if (root == null || watched.ContainsKey(root)) return;
            // Asked quietly: a solution opening is no time for a message box,
            // and the first Dabbler command says why Node cannot run.
            await TaskScheduler.Default;
            var refusal = NodeCheck.Ask();
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            var router = package.Router;
            if (refusal != null || router == null || root != openRoot || watched.ContainsKey(root)) return;
            var entry = new Watched(new TerminalNotices(root, RaisedFile));
            watched[root] = entry;
            entry.Follow = new RouterFollow(
                router,
                root,
                new[] { "terminal", "--follow", "--json" },
                line => OnLine(root, entry, line),
                package.Commands);
        }

        /// <summary>Stops following every repository that is neither the open solution's nor has a session open.</summary>
        private void Prune()
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            foreach (var root in watched.Keys.ToList())
            {
                var entry = watched[root];
                if (string.Equals(root, openRoot, StringComparison.OrdinalIgnoreCase) || entry.SessionOpen) continue;
                entry.Dispose();
                watched.Remove(root);
            }
        }

        /// <summary>One line the router printed, read off the main thread; a notice it raises is shown on it.</summary>
        private void OnLine(string root, Watched entry, string line)
        {
            var notice = entry.Read(line);
            if (notice == null) return;
            package.JoinableTaskFactory.RunAsync(async () =>
            {
                await package.JoinableTaskFactory.SwitchToMainThreadAsync();
                await ShowAsync(root, notice);
                if (notice.Kind == TerminalNotice.SessionClosed) Prune();
            }).FileAndForget("dabbler/notices/show");
        }

        /// <summary>The notice as an information bar in the main window, with a button to the session in the Work Explorer.</summary>
        private async Task ShowAsync(string root, TerminalNotice notice)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (!(await package.GetServiceAsync(typeof(SVsShell)) is IVsShell shell)) return;
            if (!(await package.GetServiceAsync(typeof(SVsInfoBarUIFactory)) is IVsInfoBarUIFactory factory)) return;
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (ErrorHandler.Failed(shell.GetProperty((int)__VSSPROPID7.VSSPROPID_MainWindowInfoBarHost, out var value))) return;
            if (!(value is IVsInfoBarHost host)) return;
            ImageMoniker icon = notice.Kind == TerminalNotice.SessionClosed ? KnownMonikers.StatusInformation : KnownMonikers.StatusWarning;
            // A session of a repository the developer has moved away from says which one it is in.
            var text = string.Equals(root, openRoot, StringComparison.OrdinalIgnoreCase) ? notice.Message : $"{notice.Message} (in {root})";
            var model = new InfoBarModel(
                new[] { new InfoBarTextSpan(text) },
                new[] { new InfoBarButton("Show in Work Explorer") },
                icon,
                isCloseButtonVisible: true);
            var bar = factory.CreateInfoBar(model);
            var events = new BarEvents(() => package.JoinableTaskFactory
                .RunAsync(() => package.ShowWorkExplorerAtAsync(root, notice.Session))
                .FileAndForget("dabbler/notices/show-work-explorer"));
            bar.Advise(events, out events.Cookie);
            host.AddInfoBar(bar);
        }

        /// <summary>One repository followed, with the notices its stream raises.</summary>
        private sealed class Watched : IDisposable
        {
            private readonly TerminalNotices notices;

            public Watched(TerminalNotices notices)
            {
                this.notices = notices;
            }

            public RouterFollow? Follow { get; set; }

            // The stream is read on the follow's thread and asked about on the main one.
            public bool SessionOpen
            {
                get
                {
                    lock (notices) return notices.SessionOpen;
                }
            }

            public TerminalNotice? Read(string line)
            {
                lock (notices) return notices.Read(line);
            }

            public void Dispose()
            {
                Follow?.Dispose();
                Follow = null;
            }
        }

        /// <summary>A bar's button shows the session and closes the bar; a closed bar stops listening.</summary>
        private sealed class BarEvents : IVsInfoBarUIEvents
        {
            private readonly Action show;

            public BarEvents(Action show)
            {
                this.show = show;
            }

            public uint Cookie;

            public void OnActionItemClicked(IVsInfoBarUIElement infoBarUIElement, IVsInfoBarActionItem actionItem)
            {
                ThreadHelper.ThrowIfNotOnUIThread();
                show();
                infoBarUIElement.Close();
            }

            public void OnClosed(IVsInfoBarUIElement infoBarUIElement)
            {
                ThreadHelper.ThrowIfNotOnUIThread();
                infoBarUIElement.Unadvise(Cookie);
            }
        }
    }
}
